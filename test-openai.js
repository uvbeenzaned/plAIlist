// Test OpenAI API
require("dotenv").config();

async function testOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;

  console.log("API Key:", apiKey ? "Present" : "Missing");
  console.log("API Key starts with:", apiKey ? apiKey.substring(0, 20) + "..." : "N/A");

  // Test with gpt-3.5-turbo first
  const models = ["gpt-3.5-turbo", "gpt-4"];

  for (const model of models) {
    console.log(`\n--- Testing model: ${model} ---`);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "user",
              content: 'Hello, respond with just "Hi"'
            }
          ],
          max_tokens: 5
        })
      });

      console.log("Response status:", response.status);
      console.log("Response statusText:", response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.log("Error response body:", errorText);

        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            console.log("Error details:", errorData.error);
          }
        } catch (e) {
          console.log("Could not parse error as JSON");
        }
        continue;
      }

      const data = await response.json();
      console.log("Success! Response:", data);

      // If we get here, this model works
      console.log(`\n✅ Model ${model} works!`);
      break;
    } catch (error) {
      console.error("Fetch error:", error);
    }
  }
}

testOpenAI();
