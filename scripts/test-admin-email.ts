import { config } from "dotenv"

import { sendAdminPaymentNotification } from "../lib/transactional-emails"

config({ path: ".env.local" })

async function testAdminEmail() {
  console.log("🚀 Testing admin payment notification...")

  try {
    const result = await sendAdminPaymentNotification({
      userEmail: "test-user@example.com",
      amount: 49.99,
      currency: "usd",
      projectName: "Test Project Launch",
      websiteUrl: "https://example.com",
    })

    console.log("✅ Email sent successfully:", result)
  } catch (error) {
    console.error("❌ Failed to send email:", error)
  }
}

testAdminEmail()
