import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

async function runTest() {
  try {
    const result = await model.generateContent("Write a 2 line poem about coding.");
    console.log("✅ Gemini Response:");
    console.log(result.response.text());
  } catch (err) {
    console.error("❌ Gemini API Error:", err.message);
  }
}

runTest();
