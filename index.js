import { config } from "dotenv";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { ConversationalRetrievalQAChain } from "langchain/chains";
import { OpenAIEmbeddings } from "@langchain/openai";
import { BufferWindowMemory } from "langchain/memory";
import { getDataFromUrls } from "./utils/webloader.js";
import { getRetriever } from "./utils/vectorStore.js";
import { getUserInput } from "./utils/userInput.js";
import { EmbeddingsFilter } from "langchain/retrievers/document_compressors/embeddings_filter";
import { ContextualCompressionRetriever } from "langchain/retrievers/contextual_compression";
import { writeFile } from "node:fs";

config();

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
const documents = await getDataFromUrls(urls);

const collectionName = "crc_chain_js";

const embeddings = new OpenAIEmbeddings({
  modelName: "text-embedding-ada-002",
});

const retriever = await getRetriever(documents, embeddings, collectionName);

const retriever_result = await retriever.getRelevantDocuments(
  "Let's say I want to invest RM 50,000 in Fixed Deposit for 12 months. Please calculate the total amount that I can withdraw at the end of the term."
);

retriever_result.forEach((result) => {
  writeFile("./retriever.txt", result.pageContent, (err) => {
    if (err) console.log(err);
  });
});

const llm = new ChatOpenAI({
  modelName: "gpt-3.5-turbo-1106",
  // modelName: "gpt-4-1106-preview",
  temperature: 0,
});

const embeddings_filter = new EmbeddingsFilter({
  embeddings,
  similarityThreshold: 0.8,
  k: 10,
});

const compression_retriever = new ContextualCompressionRetriever({
  baseCompressor: embeddings_filter,
  baseRetriever: retriever,
});

const compression_result = await compression_retriever.getRelevantDocuments(
  "Let's say I want to invest RM 50,000 in Fixed Deposit for 12 months. Please calculate the total amount that I can withdraw at the end of the term."
);
compression_result.forEach((result) => {
  writeFile("./compression_retriever.txt", result.pageContent, (err) => {
    if (err) console.log(err);
  });
});

const memory = new BufferWindowMemory({
  memoryKey: "chat_history",
  inputKey: "question",
  k: 2,
  returnMessages: true,
});

const chain = ConversationalRetrievalQAChain.fromLLM(
  llm,
  compression_retriever,
  {
    memory,
    // verbose: true,
    qaChainOptions: {
      type: "stuff",
    },
  }
);

const askQuestion = async (question) => {
  const answer = await chain.invoke({
    question,
    chat_history: memory,
  });
  return answer;
};

const questions = [
  "what is fixed deposit?",
  "How many types of fixed deposit does HongLeong Bank provide?",
  "What is the difference between Fixed Deposit and eFixed Deposit?",
  "What are the interest rates for Fixed Deposit?",
  "Let's say I want to invest RM 50,000 in Fixed Deposit for 12 months. Please calculate the total amount that I can withdraw at the end of the term.",
];

// Get Pre-defined Questions
console.log(
  `Q: ${questions[0]}\nA: ${(await askQuestion(questions[0])).text}\n`
);
console.log(
  `Q: ${questions[1]}\nA: ${(await askQuestion(questions[1])).text}\n`
);
console.log(
  `Q: ${questions[2]}\nA: ${(await askQuestion(questions[2])).text}\n`
);
console.log(
  `Q: ${questions[3]}\nA: ${(await askQuestion(questions[3])).text}\n`
);
console.log(
  `Q: ${questions[4]}\nA: ${(await askQuestion(questions[4])).text}\n`
);

// Get User Questions
// getUserInput(askQuestion);
