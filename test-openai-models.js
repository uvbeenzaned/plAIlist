// Test OpenAI API with different models
require("dotenv").config();

async function testOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;

  console.log("API Key:", apiKey ? "Present" : "Missing");
  console.log("API Key starts with:", apiKey ? apiKey.substring(0, 20) + "..." : "N/A");

  // Models to test in order of preference
  const modelsToTest = ["gpt-4.1", "gpt-4o", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"];

  for (const model of modelsToTest) {
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
              content: 'Respond with just "Hi from ' + model + '"'
            }
          ],
          max_tokens: 20
        })
      });

      console.log(`Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Error: ${errorText}`);

        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            console.log("Error details:", errorData.error);
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
        continue;
      }

      const data = await response.json();
      console.log(`✅ SUCCESS! Model ${model} responded:`, data.choices[0].message.content);
      break; // Stop at first successful model
    } catch (error) {
      console.error(`❌ Fetch error with ${model}:`, error.message);
    }
  }
}

testOpenAI();
