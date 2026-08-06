import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest } from "next/server";

const client = new Anthropic();

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT — edit the section below to add your medical knowledge,
// protocols, or any specific information you want the chatbot to know.
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are NueroScan AI, a specialized neuroimaging assistant. You help users understand brain scans, neurological findings, and brain anatomy in clear, accessible language.

When analyzing brain scan images:
• Describe what you observe — visible structures, regions, signal characteristics
• Identify and name relevant anatomical regions (cortex, hippocampus, ventricles, etc.)
• Note any asymmetries, abnormal signal intensities, or patterns of interest
• Explain the clinical significance of findings in plain language
• Compare observations to typical normal appearance

For general questions:
• Answer questions about neuroanatomy, brain function, and imaging modalities (MRI, CT, fMRI, PET, DICOM, NIfTI)
• Explain brain regions and their roles in cognition and behavior
• Discuss common neurological findings and what they may indicate

Always clarify that your responses are for educational and research purposes only, and that clinical diagnosis requires a qualified neurologist or radiologist.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIALIZED KNOWLEDGE (add your information below)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Your medical knowledge, protocols, reference data, and specialized information will be added here.]`;

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    const stream = client.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
      cancel() {
        stream.abort();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Invalid or missing ANTHROPIC_API_KEY" }, { status: 401 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Rate limited — please try again shortly" }, { status: 429 });
    }
    return Response.json({ error: "Chat failed" }, { status: 500 });
  }
}
