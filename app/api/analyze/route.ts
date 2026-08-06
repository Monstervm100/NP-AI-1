import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest } from "next/server";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a specialized neuroimaging AI assistant. Analyze the provided brain scan and respond with ONLY valid JSON — no markdown fences, no explanation, no preamble before or after the JSON.

The JSON must exactly match this structure:
{
  "scanId": "NS-XXXXXXXX",
  "timestamp": "<ISO 8601 timestamp>",
  "scanType": "<one of: MRI T1-weighted | MRI T2-weighted | CT Scan | fMRI | PET Scan | DICOM Scan | NIfTI Volume>",
  "confidence": <integer 82-98>,
  "summary": "<2-3 sentence clinical summary>",
  "findings": [
    {
      "id": "f1",
      "label": "<short clinical label>",
      "severity": "<normal | mild | moderate | severe>",
      "description": "<1-2 sentence clinical description>"
    }
  ],
  "regions": [
    {
      "name": "<anatomical region>",
      "activity": <integer 0-100>,
      "status": "<normal | elevated | reduced>"
    }
  ]
}

Include exactly 4-6 findings and exactly these 8 regions in order:
Prefrontal Cortex, Motor Cortex, Temporal Lobe, Occipital Lobe, Cerebellum, Amygdala, Hippocampus, Thalamus.

Base analysis on real neuroscience. For image inputs, analyze the actual visual content. For DICOM/NIfTI/MHA files, provide a realistic analysis from the filename and typical neuroimaging patterns.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const isImage = ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(
      file.type.toLowerCase()
    );

    let userContent: Anthropic.MessageParam["content"];

    if (isImage) {
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const mediaType = (
        file.type.toLowerCase() === "image/jpg" ? "image/jpeg" : file.type.toLowerCase()
      ) as "image/png" | "image/jpeg" | "image/webp" | "image/gif";

      userContent = [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: base64 },
        },
        {
          type: "text",
          text: `Analyze this brain scan image: "${file.name}". Provide a thorough neuroimaging analysis in the required JSON format.`,
        },
      ];
    } else {
      const sizeStr =
        file.size > 1024 * 1024
          ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
          : `${(file.size / 1024).toFixed(0)} KB`;

      userContent = `Analyze this neurological scan file:
- Filename: ${file.name}
- Format: ${file.type || "DICOM/NIfTI binary"}
- Size: ${sizeStr}

Infer the scan type from the filename and format. Provide a thorough neuroimaging analysis in the required JSON format.`;
    }

    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from AI");
    }

    const result = JSON.parse(textBlock.text);
    return Response.json(result);
  } catch (error) {
    console.error("[analyze] error:", error);

    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "Invalid or missing API key" }, { status: 401 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Rate limited — please try again shortly" }, { status: 429 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "AI returned malformed response" }, { status: 502 });
    }
    return Response.json({ error: "Analysis failed" }, { status: 500 });
  }
}
