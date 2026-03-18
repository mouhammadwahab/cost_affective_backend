const crypto = require("crypto");

function pickVariation(prompt) {
  const hash = crypto.createHash("sha256").update(prompt).digest("hex");
  const n = parseInt(hash.slice(0, 8), 16);
  return n % 4;
}

function localSimulatedAnswer(prompt) {
  const v = pickVariation(prompt);
  const trimmed = prompt.trim().slice(0, 500);

  if (!trimmed) return "Local AI: please provide a prompt.";

  // Prototype-friendly: deterministic-ish and fast.
  switch (v) {
    case 0:
      return `Local AI simulation: I understand you asked:\n\n"${trimmed}"\n\nNext step: if you share what output format you want (bullets, code, steps), I can tailor a response.`;
    case 1:
      return `Local AI simulation: Here's a structured starting point for your prompt:\n\n1) Clarify goal\n2) List constraints\n3) Draft approach\n4) Provide final output\n\nYour prompt: "${trimmed}"`;
    case 2:
      return `Local AI simulation: I can help with this. Tell me:\n- Who is the audience?\n- What should the answer include?\n- Any must-use technologies?\n\nPrompt: "${trimmed}"`;
    default:
      return `Local AI simulation: I received your prompt and would respond with a detailed plan. For now, confirm these details:\n- Desired length\n- Tone\n- Any examples you prefer\n\nPrompt: "${trimmed}"`;
  }
}

async function generate({ prompt }) {
  const responseText = localSimulatedAnswer(prompt);
  return {
    text: responseText,
    model: "local-simulator",
    usage: {
      promptChars: prompt.length,
      responseChars: responseText.length,
    },
  };
}

module.exports = { generate };

