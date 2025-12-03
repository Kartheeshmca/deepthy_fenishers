import twilio from "twilio";

const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_TOKEN;
const whatsappFrom = "whatsapp:+14155238886";   // Twilio Sandbox number

const client = twilio(accountSid, authToken);

export const sendWhatsApp = async (to, message) => {
  try {
    console.log("Trying to send WA to:", to);
    console.log("Message:", message);
    const res = await client.messages.create({
      from: whatsappFrom,
      to: `whatsapp:${to}`,
      body: message
    });
    console.log("WA SENT:", res.sid);
  } catch (err) {
    console.error("WA ERROR:", err.message);
  }
};











