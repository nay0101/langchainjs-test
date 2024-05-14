import { Chroma } from "@langchain/community/vectorstores/chroma";
import { index } from "langchain/indexes";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { PostgresRecordManager } from "@langchain/community/indexes/postgres";

async function getRetriever(documents, embeddings, collectionName) {
  const postgresTableName = collectionName;

  const vectorStoreConfig = {
    k: 3,
    searchType: "similarity",
  };

  const pgConfig = {
    postgresConnectionOptions: {
      type: "postgres",
      host: "127.0.0.1",
      port: 5432,
      user: "postgres",
      password: "123456",
      database: "vectorstore",
    },
    tableName: collectionName,
    columns: {
      idColumnName: "id",
      vectorColumnName: "vector",
      contentColumnName: "content",
      metadataColumnName: "metadata",
    },
    distanceStrategy: "cosine",
  };

  const vectorStore = new Chroma(embeddings, {
    collectionName: collectionName,
  });

  // const vectorStore = await PGVectorStore.initialize(embeddings, pgConfig);

  const recordManagerConfig = {
    postgresConnectionOptions: {
      type: "postgres",
      host: "127.0.0.1",
      port: 5432,
      user: "postgres",
      password: "123456",
      database: "postgres",
    },
    tableName: postgresTableName,
  };

  const recordManager = new PostgresRecordManager(
    collectionName,
    recordManagerConfig
  );

  await recordManager.createSchema();

  await index({
    docsSource: [],
    recordManager,
    vectorStore,
    options: {
      cleanup: "full",
      sourceIdKey: "source",
    },
  });

  console.log(
    await index({
      docsSource: documents,
      recordManager,
      vectorStore,
      options: {
        cleanup: "full",
        sourceIdKey: "source",
      },
    })
  );

  return vectorStore.asRetriever(vectorStoreConfig);
}

export { getRetriever };
