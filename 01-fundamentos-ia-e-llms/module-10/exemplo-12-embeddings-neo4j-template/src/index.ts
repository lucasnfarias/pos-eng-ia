import { HuggingFaceTransformersEmbeddings } from "@langchain/community/embeddings/huggingface_transformers";
import { CONFIG } from "./config.ts";
import { DocumentProcessor } from "./documentProcessor.ts";
import { type PretrainedOptions } from "@huggingface/transformers";
import { Neo4jVectorStore } from "@langchain/community/vectorstores/neo4j_vector";
import { displayResults } from "./util.ts";

let _neo4jVectorStore: Neo4jVectorStore | null = null;

async function clearAll(vectorStore: Neo4jVectorStore, nodeLabel: string) {
  console.log(`Clearing all nodes with label ${nodeLabel} from Neo4j...`);
  await vectorStore.query(
    `MATCH (n: \`${nodeLabel}\`) DETACH DELETE n`
  )
  console.log(`All nodes with label ${nodeLabel} have been deleted.`);
}

try {
  console.log("Starting document embeddings with Neo4j...");
  const documentProcessor = new DocumentProcessor(
    CONFIG.pdf.path,
    CONFIG.textSplitter
  )
  const documents = await documentProcessor.loadAndSplit();

  const embeddings = new HuggingFaceTransformersEmbeddings({
    model: CONFIG.embedding.modelName,
    pretrainedOptions: CONFIG.embedding.pretrainedOptions as PretrainedOptions,
  })
  // const response = await embeddings.embedQuery("Javascript")
  // console.log("Embedding response for 'Javascript':", response);
  _neo4jVectorStore = await Neo4jVectorStore.fromExistingGraph(
    embeddings,
    CONFIG.neo4j,
  )
  await clearAll(_neo4jVectorStore, CONFIG.neo4j.nodeLabel);

  for (const [index, doc] of documents.entries()) {
    console.log(`Adding document ${index + 1}/${documents.length} to Neo4j...`);
    await _neo4jVectorStore.addDocuments([doc]);
  }
  console.log("All documents have been added to Neo4j.");

  const questions = [
    // "O que é hot encoding e quando usar?",
    "O que significa treinar uma rede neural?"
  ]

  for (const question of questions) {
    console.log(`💡  QUESTION: "${question}"\n`);

    const results = await _neo4jVectorStore.similaritySearch(question, CONFIG.similarity.topK);
    console.log(`TOP ${CONFIG.similarity.topK} RESULTS:`);

    displayResults(results);
  }

  console.log("Finished processing!");

} catch (error) {
  console.error("Error processing document:", error);
} finally {
  await _neo4jVectorStore?.close()
}
