/* server.js - properly fixed version with working PDF generation */
import express from "express";
import bodyParser from "body-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";
import PDFDocument from "pdfkit";
import cors from "cors";
import dotenv from "dotenv";
import { generateConstrainedReport } from "./features/pageWordControl.js"; // 👈 NEW FEATURE IMPORT

dotenv.config();

const PORT = process.env.PORT || 5000;
console.log("✅ NODE ENV:", process.env.NODE_ENV || "development");
console.log("✅ Loaded API Key:", process.env.GEMINI_API_KEY ? "Yes" : "No");

const app = express();
app.use(bodyParser.json({ limit: "1mb" }));
app.use(cors());
app.use((req, res, next) => {
  console.log(`--> ${req.method} ${req.url}`);
  next();
});

if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️ GEMINI_API_KEY missing. Create a .env with GEMINI_API_KEY=YOUR_KEY");
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash";
console.log("Using model:", MODEL_NAME);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

// Helper: Retry with exponential backoff
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

// Function to parse content into structured sections
function parseContent(text) {
  const sections = [];
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  let currentSection = null;
  let currentContent = [];
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    if (
      lowerLine.includes('title:') || 
      lowerLine.startsWith('abstract') ||
      lowerLine.startsWith('introduction') ||
      lowerLine.includes('main body') ||
      lowerLine.startsWith('conclusion') ||
      lowerLine.startsWith('references')
    ) {
      if (currentSection) {
        sections.push({
          type: currentSection,
          content: currentContent.join('\n').trim()
        });
      }
      
      if (lowerLine.includes('title:')) {
        currentSection = 'title';
        currentContent = [line.replace(/^title:\s*/i, '')];
      } else if (lowerLine.startsWith('abstract')) {
        currentSection = 'abstract';
        currentContent = [];
      } else if (lowerLine.startsWith('introduction')) {
        currentSection = 'introduction';
        currentContent = [];
      } else if (lowerLine.includes('main body')) {
        currentSection = 'main_body';
        currentContent = [];
      } else if (lowerLine.startsWith('conclusion')) {
        currentSection = 'conclusion';
        currentContent = [];
      } else if (lowerLine.startsWith('references')) {
        currentSection = 'references';
        currentContent = [];
      }
    } else {
      if (currentSection) {
        currentContent.push(line);
      }
    }
  }
  
  if (currentSection && currentContent.length > 0) {
    sections.push({
      type: currentSection,
      content: currentContent.join('\n').trim()
    });
  }
  
  return sections;
}

// Simple function to add formatted text
function addFormattedText(doc, text, fontSize = 12) {
  if (!text || text.trim().length === 0) return;
  
  const paragraphs = text.split(/\n\s*\n/);
  
  paragraphs.forEach((paragraph, index) => {
    if (paragraph.trim().length === 0) return;
    
    const lines = paragraph.split('\n');
    
    lines.forEach(line => {
      line = line.trim();
      if (line.length === 0) return;
      
      if (line.startsWith('* ')) {
        doc.moveDown(0.2);
        const bulletText = line.substring(2).trim();
        
        if (bulletText.includes('**')) {
          const parts = bulletText.split(/(\*\*[^*]+\*\*)/);
          doc.fontSize(fontSize).text('• ', { continued: true });
          
          parts.forEach(part => {
            if (part.startsWith('**') && part.endsWith('**')) {
              const boldText = part.slice(2, -2);
              doc.font('Helvetica-Bold').text(boldText, { continued: true });
            } else if (part.length > 0) {
              doc.font('Helvetica').text(part, { continued: true });
            }
          });
          doc.text('');
        } else {
          doc.fontSize(fontSize).font('Helvetica').text('• ' + bulletText);
        }
        doc.moveDown(0.3);
      } else {
        if (line.includes('**')) {
          const parts = line.split(/(\*\*[^*]+\*\*)/);
          parts.forEach((part, partIndex) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              const boldText = part.slice(2, -2);
              doc.fontSize(fontSize).font('Helvetica-Bold').text(boldText, { 
                continued: partIndex < parts.length - 1,
                align: 'justify'
              });
            } else if (part.length > 0) {
              doc.fontSize(fontSize).font('Helvetica').text(part, { 
                continued: partIndex < parts.length - 1,
                align: 'justify'
              });
            }
          });
          if (!line.endsWith(':')) {
            doc.moveDown(0.5);
          }
        } else {
          doc.fontSize(fontSize).font('Helvetica').text(line, { align: 'justify' });
          doc.moveDown(0.5);
        }
      }
    });
    
    if (index < paragraphs.length - 1) {
      doc.moveDown(0.5);
    }
  });
}

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, model: MODEL_NAME });
});

// Quick test endpoint
app.get("/test-gemini", async (req, res) => {
  try {
    const prompt = req.query.q || "Write a 2-line poem about coding.";
    const result = await generateWithRetry(model, prompt, 3);

    let text = "";
    if (result.response?.text) {
      text = result.response.text();
    } else if (
      result.response?.candidates &&
      result.response.candidates[0]?.content?.parts[0]?.text
    ) {
      text = result.response.candidates[0].content.parts[0].text;
    } else {
      text = JSON.stringify(result.response || result, null, 2);
    }

    res.json({ ok: true, text });
  } catch (err) {
    console.error("test-gemini error:", err);
    res.status(500).json({ ok: false, error: err.message || "unknown" });
  }
});

// Generate PDF route
app.post("/generate-report", async (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.toString().trim()) {
    return res.status(400).json({ ok: false, error: "No input text provided" });
  }

  const prompt = `Create a well-structured academic report about: "${text}"


Please format your response exactly like this structure:

Title: [Your report title here]

Abstract
[Write a concise abstract summarizing the main points of the report]

Introduction
[Write an introduction that sets up the topic and provides context]

Main Body
[Write detailed content organized into clear paragraphs. Use **bold text** for important terms and section headings within the main body. Include specific information, examples, and analysis related to the topic]

Conclusion
[Write a conclusion that summarizes key findings and insights]

References
[1] Academic Source Example
[2] Research Paper Reference
[3] Book or Article Reference

Make sure each section has substantial, informative content. Use **bold formatting** for important terms and subheadings.`;

  let output = "";
  let usedFallback = false;

  try {
    const result = await generateWithRetry(model, prompt, 3);
    console.log("Gemini raw response received");

    if (result.response?.text) {
      output = result.response.text();
    } else if (
      result.response?.candidates &&
      result.response.candidates[0]?.content?.parts[0]?.text
    ) {
      output = result.response.candidates[0].content.parts[0].text;
    }

    if (!output || output.trim().length === 0) {
      throw new Error("Empty response from Gemini");
    }
  } catch (err) {
    console.error("⚠️ Gemini failed in /generate-report:", err?.message || err);
    usedFallback = true;
    output = `Title: Report on ${text}

Abstract
This report provides an overview and analysis of ${text}. Due to technical limitations, this is a placeholder document.

Introduction
${text} is significant and warrants detailed examination.

Main Body
**Key Analysis:** ${text} represents an important area of study.

Conclusion
In conclusion, ${text} deserves continued attention.

References
[1] Academic Source
[2] Research Study
[3] Historical Work`;
  }

  try {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=report.pdf");
    res.setHeader("Cache-Control", "no-store");

    const doc = new PDFDocument({ margin: 60, size: 'A4' });
    doc.pipe(res);

    const sections = parseContent(output);
    const title = sections.find(s => s.type === 'title')?.content || 'Generated Report';

    // Cover Page
    doc.fontSize(28).fillColor('#2c3e50').font('Helvetica-Bold').text('Academic Report', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(20).fillColor('#34495e').font('Helvetica-Bold').text(title, { align: 'center' });
    doc.moveDown(3);
    doc.fontSize(14).fillColor('#7f8c8d').font('Helvetica').text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown(1);
    if (usedFallback) {
      doc.fontSize(12).fillColor('#e74c3c').font('Helvetica-Oblique').text('Note: Using fallback content', { align: 'center' });
    }

    // Table of Contents
    doc.addPage();
    doc.fontSize(22).fillColor('#2c3e50').font('Helvetica-Bold').text('Table of Contents', { align: 'center', underline: true });
    doc.moveDown(2);

    const tocItems = sections.filter(s => s.type !== 'title');
    tocItems.forEach((section, index) => {
      let sectionName = section.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      doc.fontSize(14).fillColor('#2c3e50').font('Helvetica').text(`${index + 1}. ${sectionName}`, { indent: 30 });
      doc.moveDown(0.8);
    });

    // Sections
    sections.forEach((section) => {
      if (section.type === 'title') return;
      doc.addPage();
      let sectionTitle = section.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      doc.fontSize(20).fillColor('#2c3e50').font('Helvetica-Bold').text(sectionTitle, { underline: true });
      doc.moveDown(1.5);
      if (section.content && section.content.trim()) {
        addFormattedText(doc, section.content, 12);
      }
    });

    // Footer
    doc.on('pageAdded', () => {
      const pageNumber = doc._pageBuffer.length;
      if (pageNumber > 1) {
        doc.save();
        doc.fontSize(10).fillColor('#95a5a6').font('Helvetica');
        doc.text(`Page ${pageNumber}`, 60, doc.page.height - 30, { align: 'center', width: doc.page.width - 120 });
        doc.restore();
      }
    });

    doc.end();
  } catch (pdfErr) {
    console.error("PDF generation error:", pdfErr);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: "PDF generation failed: " + pdfErr.message });
    }
  }
});

// ✅ NEW route for constrained reports
app.post("/generate-constrained-report", generateConstrainedReport);

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
