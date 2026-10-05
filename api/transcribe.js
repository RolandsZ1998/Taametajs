export async function POST(request) {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return Response.json({ error: 'OPENAI_API_KEY nav iestatīts Vercel.' }, { status: 500 });
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') return Response.json({ error: 'Audio fails nav saņemts.' }, { status: 400 });
    const size = Number(file.size || 0);
    if (size > 4 * 1024 * 1024) return Response.json({ error: 'Ieraksts ir pārāk liels. Ieraksti īsāku tekstu.' }, { status: 413 });
    const upstream = new FormData();
    upstream.append('file', file, file.name || 'recording.webm');
    upstream.append('model', 'gpt-4o-mini-transcribe');
    upstream.append('language', 'lv');
    upstream.append('response_format', 'json');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: upstream
    });
    const data = await res.json();
    if (!res.ok) return Response.json({ error: data?.error?.message || 'OpenAI transkripcijas kļūda.' }, { status: res.status });
    return Response.json({ text: data.text || '' });
  } catch (err) {
    return Response.json({ error: err?.message || 'Servera kļūda.' }, { status: 500 });
  }
}
