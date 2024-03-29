import { config } from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from "@langchain/core/prompts";
import { ConversationalRetrievalQAChain } from "langchain/chains";
import { OpenAIEmbeddings } from "@langchain/openai";
import { BufferWindowMemory } from "langchain/memory";
import { useCheerio, usePuppeteer } from "./utils/webloaders.js";
import { getRetriever } from "./utils/vectorStore.js";
import { generateAnswers } from "./utils/answerGeneration.js";
import { EmbeddingsFilter } from "langchain/retrievers/document_compressors/embeddings_filter";
import { ContextualCompressionRetriever } from "langchain/retrievers/contextual_compression";
import { useCheerioWebCrawler } from "./utils/webcrawler.js";

config();

// const urls = [
//   "https://www.hlb.com.my/en/personal-banking/fixed-deposit.html?icp=hlb-en-all-footer-txt-fd",
//   "https://www.hlb.com.my/en/personal-banking/fixed-deposit/fixed-deposit-account/fixed-deposit-account.html",
//   "https://www.hlb.com.my/en/personal-banking/fixed-deposit/fixed-deposit-account/e-fixed-deposit.html",
//   "https://www.hlb.com.my/en/personal-banking/fixed-deposit/fixed-deposit-account/flexi-fd.html",
//   "https://www.hlb.com.my/en/personal-banking/fixed-deposit/fixed-deposit-account/senior-savers-flexi-fd.html",
//   "https://www.hlb.com.my/en/personal-banking/fixed-deposit/fixed-deposit-account/junior-fixed-deposit.html",
//   "https://www.hlb.com.my/en/personal-banking/fixed-deposit/fixed-deposit-account/foreign-fixed-deposit-account.html",
//   "https://www.hlb.com.my/en/personal-banking/help-support/fees-and-charges/deposits.html",
// ];

/* Create Training Data for Chatbot */
const urls = await useCheerioWebCrawler(
  "https://www.hlb.com.my/en/personal-banking/home.html",
  1
);
const documents = await useCheerio(urls);

const embeddings = new OpenAIEmbeddings({
  // modelName: "text-embedding-3-small",
  modelName: "text-embedding-ada-002",
});

const collectionName = "postgres_js";
const retriever = await getRetriever(documents, embeddings, collectionName);
// ----------------------------------------
let tempToken = 0;
const llm = new ChatOpenAI({
  // modelName: "gpt-3.5-turbo-1106",
  modelName: "gpt-4-0125-preview",
  temperature: 0.1,
  streaming: true,
  callbacks: [
    {
      handleLLMNewToken(token) {
        console.log(token);
      },
      handleLLMEnd(output) {
        console.log(output);
      },
    },
  ],
});

/* Creating Prompt */
const system_template = `Use the following pieces of context to answer the users question. 
If you don't know the answer, just say that you don't know, don't try to make up an answer.
----------------
{context}`;

const messages = [
  SystemMessagePromptTemplate.fromTemplate(system_template),
  HumanMessagePromptTemplate.fromTemplate("{question}"),
];

const prompt = ChatPromptTemplate.fromMessages(messages);

/* Creating Compression Retriever for Accurate Results */
const embeddings_filter = new EmbeddingsFilter({
  embeddings,
  similarityThreshold: 0.8,
  k: 10,
});

const compression_retriever = new ContextualCompressionRetriever({
  baseCompressor: embeddings_filter,
  baseRetriever: retriever,
});

/* Creating Memory Instance */
const memory = new BufferWindowMemory({
  memoryKey: "chat_history",
  inputKey: "question",
  outputKey: "text",
  k: 3,
  returnMessages: true,
});

/* Creating Question Chain */
const chain = ConversationalRetrievalQAChain.fromLLM(
  llm,
  compression_retriever,
  {
    returnSourceDocuments: true,
    memory: memory,
    // verbose: true,
    qaChainOptions: {
      type: "stuff",
      prompt: prompt,
    },
  }
);

/* Invoking Chain for Q&A */
const askQuestion = async (question) => {
  const result = await chain.invoke({
    question,
    chat_history: memory,
  });

  const answer = await result.text;
  const sources = await result.sourceDocuments;
  console.log(sources);
  console.log(answer);
  return { question, answer, sources };
};

// await generateAnswers({
//   askQuestion,
//   returnSources: true,
//   userInput: true,
// }); // Set userInput to true to get the User Input
// await askQuestion(
//   "I want to invest USD10000 for Brillar Bank Foreign Currency Fixed Deposit for 12 months. What is the total interest amount at the end of term in RM?"
// );
await askQuestion(
  "what is the interest rate for foreign currency fixed deposit in USD"
);
