import { GoogleGenerativeAI } from "@google/generative-ai";
import { createPDF } from "../services/pdfService.js"; // if you made pdfService.js

// Setup Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

// ✅ Copy generateWithRetry here
async function generateWithRetry(model, prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return result;
    } catch (err) {
      console.error(`Generate attempt ${i + 1} failed:`, err?.message || err);
      if ((err.status === 503 || err.status === 429) && i < retries - 1) {
        const wait = 1000 * Math.pow(2, i);
        console.log(`Retrying in ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Retries exhausted");
}

export async function generateConstrainedReport(req, res) {
  const { text, pages, words } = req.body || {};
  if (!text) {
    return res.status(400).json({ ok: false, error: "No input text provided" });
  }

  let constraint = "";
  if (pages) constraint += `The report should be about ${pages} page(s). `;
  if (words) constraint += `The report should have around ${words} words. `;

  const prompt = `Create a detailed academic report about: "${text}"

${constraint}

Structure the report as:
- Title
- Abstract
- Introduction
- Main Body
- Conclusion
- References (with [1], [2], etc.)
`;

  try {
    const result = await generateWithRetry(model, prompt, 3);

    let output = "";
    if (result.response?.text) {
      output = result.response.text();
    } else if (
      result.response?.candidates &&
      result.response.candidates[0]?.content?.parts[0]?.text
    ) {
      output = result.response.candidates[0].content.parts[0].text;
    }

    if (!output || !output.trim()) throw new Error("Empty response from Gemini");

    // For now → just send plain text back
    res.json({ ok: true, output });

    // Later → reuse your PDF generator
    // createPDF(res, output, text);
  } catch (err) {
    console.error("❌ Error generating constrained report:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
}
