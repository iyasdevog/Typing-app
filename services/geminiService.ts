
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const CS_STATIC_TEXTS: Record<string, string> = {
  'Official Assessment: Hardware': 
    "A computer system consists of hardware and software working together. The Central Processing Unit is the primary component that executes instructions. It contains an Arithmetic Logic Unit for calculations and a Control Unit to manage data flow. Primary memory, known as RAM, stores data currently in use, while secondary storage like hard drives provides long-term retention. Input devices like keyboards and output devices like monitors allow human interaction with the machine.",
  'Official Assessment: Networking': 
    "Computer networks allow multiple devices to share resources and communicate. The Internet is a vast network of networks using the TCP/IP protocol suite. Each device is identified by a unique IP address. Routers are responsible for forwarding data packets between different networks. Local Area Networks cover small areas like a single room or building, while Wide Area Networks can span across cities or countries. Security protocols like encryption help protect data during transmission.",
  'Official Assessment: Logic & Code': 
    "Programming involves creating a set of instructions for a computer to follow. Algorithms are step-by-step procedures used for calculations and data processing. High-level languages like Python or Java are designed to be easy for humans to read and write. Compilers and interpreters translate this code into machine language that the CPU can execute. Logical structures like loops and conditionals allow programs to make decisions and repeat tasks efficiently.",
  'Official Assessment: Cybersecurity':
    "Cybersecurity is the practice of protecting systems and networks from digital attacks. Common threats include malware, phishing, and denial-of-service attacks. Strong passwords and multi-factor authentication are essential for verifying user identity. Firewalls act as barriers between trusted and untrusted networks. Data privacy is a fundamental right, and encryption is used to ensure that sensitive information remains unreadable to unauthorized parties."
};

export function getStaticText(topic: string): string {
  return CS_STATIC_TEXTS[topic] || CS_STATIC_TEXTS['Official Assessment: Hardware'];
}

export async function generateTypingText(topic: string, difficulty: 'Easy' | 'Medium' | 'Hard'): Promise<string> {
  const prompt = `Short typing test paragraph about ${topic}. Level: ${difficulty}. Limit: 100 words. No intro/outro. Direct text only.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.1,
        thinkingConfig: { thinkingBudget: 0 }
      },
    });
    return response.text.trim();
  } catch (error) {
    return getStaticText(topic);
  }
}

export async function getPerformanceFeedback(stats: { wpm: number, accuracy: number, topic: string }): Promise<string> {
  const prompt = `Quick feedback: WPM ${stats.wpm}, Accuracy ${stats.accuracy}%, Topic ${stats.topic}. 1-2 short sentences.`;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { temperature: 0.5 }
    });
    return response.text.trim();
  } catch {
    return "Assessment complete. Good effort on the typing module.";
  }
}
