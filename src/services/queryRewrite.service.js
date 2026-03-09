const Groq = require("groq-sdk");

const client = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

async function rewriteQuery(question, history = []) {

  if (!history.length) return question;

  const context = history
    .slice(-4)
    .map(m => `${m.role}: ${m.content}`)
    .join("\n");

  const prompt = `
Rewrite the user question so it becomes a complete standalone search query.

Conversation:
${context}

User question:
${question}

Rewritten query:
`;

  try {

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 50
    });

    return response.choices[0].message.content.trim() || question;

  } catch (error) {

    console.warn("[QueryRewrite] failed:", error.message);

    return question;
  }
}

module.exports = { rewriteQuery };