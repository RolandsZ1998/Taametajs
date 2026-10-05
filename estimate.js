const OPENAI_URL = 'https://api.openai.com/v1/responses';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string' },
          work: { type: 'string' },
          quantity: { type: ['number','null'] },
          unit: { type: 'string' },
          sourceText: { type: 'string' },
          confidence: { type: 'number' },
          needsReview: { type: 'boolean' },
          reviewReason: { type: 'string' }
        },
        required: ['category','work','quantity','unit','sourceText','confidence','needsReview','reviewReason']
      }
    },
    assumptions: { type: 'array', items: { type: 'string' } }
  },
  required: ['items','assumptions']
};

export default async function handler(req) {
  try {
    if (req.method !== 'POST') return Response.json({error:'Method not allowed'},{status:405});
    const key = process.env.OPENAI_API_KEY;
    if (!key) return Response.json({error:'OPENAI_API_KEY nav iestatīts Vercel Environment Variables.'},{status:500});
    const body = req.body || {};
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return Response.json({error:'Darba apraksts nav saņemts.'},{status:400});
    if (text.length > 30000) return Response.json({error:'Darba apraksts ir pārāk garš (maks. 30 000 rakstzīmes). Sadaliet to vairākās daļās.'},{status:413});

    const catalog = Array.isArray(body.catalog) ? body.catalog.slice(0,220) : [];
    const catalogText = catalog.map(x=>`${x.id} | ${x.cat} | ${x.name} | ${x.unit}`).join('\n');
    const instructions = `Tu esi būvniecības tāmēšanas strukturēšanas AI latviešu valodā.
Tavs uzdevums NAV noteikt cenu. Tavs uzdevums ir izlasīt VISU lietotāja tekstu no sākuma līdz beigām un izveidot atsevišķu pozīciju KATRAM skaidri minētam darbam.

OBLIGĀTI NOTEIKUMI:
1. Nekad neapstājies pie pirmās atrastās pozīcijas. Apstrādā visu tekstu.
2. Ja lietotājs dod numurētu sarakstu, katram darba punktam jābūt atsevišķai pozīcijai. Nesapludini dažādus darbus vienā pozīcijā.
3. Saglabā lietotāja norādītos daudzumus un vienības. Nekad neizdomā daudzumu.
4. Ja daudzums nav norādīts, quantity=null, needsReview=true un reviewReason paskaidro, ka jāuzmēra.
5. Ja viena rinda satur vairākus skaidri atšķiramus darbus, sadali tos atsevišķās pozīcijās tikai tad, ja katram darbam ir sava loģiska vienība/darbība. Ja vienā rindā ir viens komplekss darbs, atstāj vienu pozīciju.
6. sourceText jābūt īsam oriģinālā teksta fragmentam, kas pamato pozīciju.
7. confidence ir 0..1. Ja ir neskaidrība, samazini confidence un atzīmē needsReview=true.
8. Neizdomā materiālus, biezumus, platības, garumus, gabalu skaitu vai darba stundas, ja tie nav tekstā.
9. assumptions drīkst saturēt tikai svarīgas neskaidrības vai trūkstošus datus.
10. Atbildi tikai pēc norādītās JSON shēmas.

Esošais cenu kataloga nosaukumu saraksts ir tikai matching palīgmateriāls; izvēlies semantiski tuvāko pozīciju tikai frontendā, nevis izdomā jaunu kataloga cenu.

KATALOGA NOSAUKUMI:\n${catalogText}`;

    const payload = {
      model: process.env.OPENAI_ESTIMATE_MODEL || 'gpt-5.5',
      input: [
        { role:'system', content: instructions },
        { role:'user', content: `IZANALIZĒ VISU ŠO TEKSTU:\n\n${text}` }
      ],
      text: { format: { type:'json_schema', name:'construction_estimate', strict:true, schema } },
      max_output_tokens: 12000
    };

    const res = await fetch(OPENAI_URL,{method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data = await res.json();
    if(!res.ok) return Response.json({error:data?.error?.message||'OpenAI API kļūda.'},{status:res.status});
    const output = data.output_text || data.output?.flatMap(x=>x.content||[]).find(x=>x.type==='output_text')?.text || '';
    let parsed;
    try { parsed=JSON.parse(output); } catch { return Response.json({error:'AI neatgrieza derīgu strukturētu JSON.'},{status:502}); }
    return Response.json(parsed);
  } catch(err) {
    return Response.json({error:err?.message||'Servera kļūda.'},{status:500});
  }
}
