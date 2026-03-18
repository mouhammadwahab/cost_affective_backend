const { generate: generateLocal } = require("./providers/localSimulator");
const { generateOpenAI } = require("./providers/openai");

function getProviderPreference() {
  return (process.env.AI_PROVIDER || "local").toLowerCase();
}

async function generateAI({ prompt, model }) {
  const pref = getProviderPreference();
  const apiKey = process.env.OPENAI_API_KEY || "";

  // If OPENAI_API_KEY is present, allow OpenAI provider explicitly or as a fallback.
  const useOpenAI = pref === "openai" || (pref === "openai_fallback" && apiKey);
  if (useOpenAI && apiKey) {
    try {
      return await generateOpenAI({ prompt, model });
    } catch (err) {
      if (pref === "openai") throw err;
      // For fallback mode, silently use local simulation.
    }
  }

  return await generateLocal({ prompt, model });
}

module.exports = { generateAI };

