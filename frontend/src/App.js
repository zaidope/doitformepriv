import React, { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";

function App() {
  const [text, setText] = useState("");
  const [pages, setPages] = useState("");
  const [words, setWords] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerateReport = async () => {
    try {
      setLoading(true);
      const response = await axios.post(
        "http://localhost:5000/generate-constrained-report", // 👈 use new backend route
        { text, pages, words }, // 👈 send extra fields
        { responseType: "blob" }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "report.pdf");
      document.body.appendChild(link);
      link.click();
    } catch (err) {
      alert("Error generating report. Check backend console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-100 via-blue-100 to-pink-100">
      <motion.div
        className="bg-white p-10 rounded-2xl shadow-2xl w-[600px] max-w-[90%]"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
          📄 Do It For Me
        </h1>
        <p className="text-center text-gray-500 mb-6">
          Generate clean academic reports in one click
        </p>

        {/* Topic input */}
        <textarea
          rows={6}
          placeholder="Enter your topic..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none resize-none mb-4"
        />

        {/* New inputs for pages & words */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <input
            type="number"
            placeholder="Pages"
            value={pages}
            onChange={(e) => setPages(e.target.value)}
            className="p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none"
          />
          <input
            type="number"
            placeholder="Words"
            value={words}
            onChange={(e) => setWords(e.target.value)}
            className="p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-400 outline-none"
          />
        </div>

        {/* Generate Button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          onClick={handleGenerateReport}
          disabled={loading || !text.trim()}
          className={`w-full py-3 rounded-xl text-lg font-semibold transition ${
            loading || !text.trim()
              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
              : "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-md"
          }`}
        >
          {loading ? "⏳ Generating..." : "✨ Generate Report"}
        </motion.button>

        <p className="text-xs text-gray-400 text-center mt-6">
          Made with ❤️ zaid
        </p>
      </motion.div>
    </div>
  );
}

export default App;
