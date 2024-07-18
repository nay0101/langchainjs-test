import { config } from "dotenv";
import { ChatVertexAI } from "@langchain/google-vertexai";

import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from "@langchain/core/prompts";
import { ConversationalRetrievalQAChain } from "langchain/chains";
import { BufferWindowMemory } from "langchain/memory";
import { useCheerio, usePuppeteer } from "../utils/webloaders.js";
import { getRetriever } from "../utils/vectorStore.js";
import { EmbeddingsFilter } from "langchain/retrievers/document_compressors/embeddings_filter";
import { ContextualCompressionRetriever } from "langchain/retrievers/contextual_compression";
import { GoogleVertexAIEmbeddings } from "@langchain/community/embeddings/googlevertexai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { reset } from "../reset.js";

config();
await reset();

const urls = [
  "https://www.hlb.com.my/en/personal-banking/fixed-deposit.html?icp=hlb-en-all-footer-txt-fd",
  "https://www.hlb.com.my/en/personal-banking/fixed-deposit/fixed-deposit-account/fixed-deposit-account.html",
  "https://www.hlb.com.my/en/personal-banking/fixed-deposit/fixed-deposit-account/e-fixed-deposit.html",
  "https://www.hlb.com.my/en/personal-banking/fixed-deposit/fixed-deposit-account/flexi-fd.html",
  "https://www.hlb.com.my/en/personal-banking/fixed-deposit/fixed-deposit-account/senior-savers-flexi-fd.html",
  "https://www.hlb.com.my/en/personal-banking/fixed-deposit/fixed-deposit-account/junior-fixed-deposit.html",
  "https://www.hlb.com.my/en/personal-banking/fixed-deposit/fixed-deposit-account/foreign-fixed-deposit-account.html",
  "https://www.hlb.com.my/en/personal-banking/help-support/fees-and-charges/deposits.html",
];

/* Create Training Data for Chatbot */
const documents = await useCheerio(urls);
// const documents = await useDirectoryLoader("./assets/HLB Data");

const embeddings = new GoogleVertexAIEmbeddings({
  model: "text-multilingual-embedding-preview-0409",
});

// const embeddings = new OpenAIEmbeddings({
//   modelName: "text-embedding-3-large",
//   dimensions: 256,
// });

const collectionName = "testvertex_openai_3";
const retriever = await getRetriever({ documents, embeddings, collectionName });
// ----------------------------------------

const llm = new ChatVertexAI({
  model: "gemini-1.5-pro-preview-0409",
  streaming: true,
  callbacks: [
    {
      handleLLMNewToken(token) {
        console.log(token);
      },
    },
    {
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
  similarityThreshold: 0.7,
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
const chain = ConversationalRetrievalQAChain.fromLLM(llm, retriever, {
  returnSourceDocuments: true,
  memory: memory,
  // verbose: true,
  qaChainOptions: {
    type: "stuff",
    prompt: prompt,
  },
});

/* Invoking Chain for Q&A */
const askQuestion = async (question) => {
  const result = await chain.invoke({
    question,
    chat_history: memory,
  });
  const answer = await result.text;
  const sources = await result.sourceDocuments;
  console.log(answer);
  console.log(sources);
  return { question, answer, sources };
};

// await generateAnswers({
//   askQuestion,
//   returnSources: true,
//   userInput: false,
// }); // Set userInput to true to get the User Input

await askQuestion("what are the interest rates for fixed deposit?");
