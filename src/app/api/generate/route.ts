import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

const DEFAULT_SYSTEM_PROMPT = `STRICT_CODE_GENERATOR_MODE:
You are an expert Senior UI Engineer. Your ONLY output is a single, executable React/Tailwind component.

CRITICAL PIPELINE RULES:
1. SINGLE BLOCK ONLY: Do NOT return multiple code blocks. Do NOT return separate CSS or HTML files. 
2. NO TEXT: Do NOT explain your work, do NOT write a PRD, do NOT use markdown text outside the code block.
3. TAILWIND ONLY: All styles MUST be in Tailwind classes. Do NOT generate separate CSS blocks.
4. INPUT: Treat every input as a requirement for an immediate UI render. 
5. STRUCTURE: Return a single default exported functional component.

DESIGN LANGUAGE:
- Premium Dark Glassmorphism.
- Accent Palette: Cyan (#22d3ee) for actions, Purple (#a855f7) for depth.
- Standard SVG icons (stroke-width: 1.5).`;

export async function POST(req: Request) {
  try {
    const { prd, systemPrompt } = await req.json();

    if (!prd) {
      return NextResponse.json({ error: "Input prompt is required" }, { status: 400 });
    }

    if (!API_KEY) {
      return NextResponse.json({
        code: `
import React from 'react';

export default function EntryPoint() {
  return (
    <div className="min-h-screen bg-[#030408] text-white flex flex-col items-center justify-center p-8">
      <div className="glass p-12 max-w-xl text-center rounded-[3rem] border border-white/5">
        <h1 className="text-3xl font-black mb-4">API KEY REQUIRED</h1>
        <p className="text-slate-400">Please provide a valid Gemini or Groq API key in the configuration.</p>
      </div>
    </div>
  );
}
        `.trim()
      });
    }

    let text = "";

    if (API_KEY.startsWith("gsk_") || API_KEY.startsWith("xai-")) {
      const isGroq = API_KEY.startsWith("gsk_");
      const modelName = isGroq ? "llama-3.3-70b-versatile" : "grok-beta";
      const apiUrl = isGroq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.x.ai/v1/chat/completions";

      const aiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
            { role: "user", content: `RENDER_UI_FOR: ${prd}` }
          ],
          temperature: 0,
        }),
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json();
        throw new Error(`Provider Error: ${errorData.error?.message || aiResponse.statusText}`);
      }

      const data = await aiResponse.json();
      text = data.choices[0].message.content;
    } else {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(`${systemPrompt || DEFAULT_SYSTEM_PROMPT}\n\nUSER_REQUEST: ${prd}`);
      const response = await result.response;
      text = response.text();
    }

    // Advanced Multi-Block Selection Logic
    let code = "";
    const codeBlocks = Array.from(text.matchAll(/```(?:tsx|jsx|javascript|typescript|react|html|css)?\n([\s\S]*?)```/g)).map(m => m[1].trim());
    
    if (codeBlocks.length > 0) {
      // Prioritize the block that looks like a React component
      const reactBlock = codeBlocks.find(b => 
        (b.includes("export default") || b.includes("return (")) && 
        !b.includes("### CSS") // Filter out blocks that are just CSS descriptions
      );
      code = reactBlock || codeBlocks[0];
    } else {
      // Fallback if AI returned raw code without backticks
      if (text.includes("export default") || (text.includes("<") && text.includes(">"))) {
        code = text.trim();
      } else {
        throw new Error("AI returned descriptive text instead of a visual component. Try refining your requirements.");
      }
    }

    return NextResponse.json({ code });
  } catch (error) {
    console.error("AI Generation failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Synthesis failed" }, { status: 500 });
  }
}
