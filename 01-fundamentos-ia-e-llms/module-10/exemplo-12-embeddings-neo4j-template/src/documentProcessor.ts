import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { type TextSplitterConfig } from "./config.ts";

export class DocumentProcessor {
  private pdfPath: string;
  private textSplitterConfig: TextSplitterConfig;

  constructor(pdfPath: string, textSplitterConfig: TextSplitterConfig) {
    this.pdfPath = pdfPath;
    this.textSplitterConfig = textSplitterConfig;
  }

  async loadAndSplit() {
    const loader = new PDFLoader(this.pdfPath);
    const rawDocs = await loader.load();
    console.log(`Loaded ${rawDocs.length} pages from PDF.`);

    const splitter = new RecursiveCharacterTextSplitter(this.textSplitterConfig);
    const docs = await splitter.splitDocuments(rawDocs);
    console.log(`Split into ${docs.length} chunks.`);


    return docs.map(doc => ({
      ...doc,
      metadata: {
        source: doc.metadata.source,
        page: doc.metadata?.loc?.pageNumber,
      }
    }))
  }
}
