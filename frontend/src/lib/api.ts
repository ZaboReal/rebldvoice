const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export async function getToken(
  roomName?: string,
  participantName?: string
): Promise<{ token: string; url: string; room_name: string }> {
  const res = await fetch(`${API_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      room_name: roomName,
      participant_name: participantName || "user",
    }),
  });
  if (!res.ok) throw new Error("Failed to get token");
  return res.json();
}
