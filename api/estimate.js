const MODEL = 'gpt-4.1-mini';

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    project: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sourceText: { type: 'string' },
          name: { type: 'string' },
          catalogId: { type: 'integer' },
          qty: { type: 'number' },
          unit: { type: 'string' },
          notes: { type: 'string' },
          confidence: { type: 'number' }
        },
        required: ['sourceText','name','catalogId','qty','unit','notes','confidence']
      }
    },
    assumptions: { type: 'array', items: { type: 'string' } }
  },
  required: ['project','items','assumptions']
};

function json(res, status, body){
  res.status(status).setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res){
  if(req.method === 'GET'){
    return json(res, 200, {ok:true, configured:Boolean(process.env.OPENAI_API_KEY), model:MODEL});
  }
  if(req.method !== 'POST'){
    res.setHeader('Allow','GET, POST');
    return json(res, 405, {error:'Metode nav atļauta.'});
  }

  const key=process.env.OPENAI_API_KEY;
  if(!key) return json(res, 500, {error:'OPENAI_API_KEY nav iestatīts Vercel. Pievieno to Project Settings → Environment Variables un veic Redeploy.'});

  try{
    const body=req.body||{};
    const text=typeof body.text==='string'?body.text.trim():'';
    const catalog=Array.isArray(body.catalog)?body.catalog:[];
    if(!text) return json(res,400,{error:'Nav saņemts objekta apraksts.'});
    if(!catalog.length) return json(res,400,{error:'Katalogs nav saņemts.'});
    if(text.length>12000) return json(res,413,{error:'Apraksts ir pārāk garš. Sadaliet objektu vairākās tāmes daļās.'});

    const safeCatalog=catalog.slice(0,500).map(x=>({
      id:Number(x.id)||0,
      category:String(x.cat||''),
      name:String(x.name||''),
      unit:String(x.unit||'')
    })).filter(x=>x.id>0&&x.name);

    const instructions=`Tu esi profesionāls Latvijas būvniecības tāmētāja asistents. Tavs uzdevums ir pārvērst lietotāja brīvi uzrakstītu objekta darbu aprakstu strukturētā sākuma tāmē.

NOTEIKUMI:
- Izlasi VISU lietotāja tekstu, ne tikai pirmo teikumu.
- Sadalī katru skaidri minēto darbu atsevišķā pozīcijā.
- Izmanto tikai dotā kataloga pozīcijas, ja tās atbilst. catalogId ir kataloga id.
- Ja nav drošas kataloga atbilstības, catalogId=0 un saglabā saprotamu name; šai pozīcijai cena būs jāievada manuāli.
- Nekad neizdomā daudzumu. Ja daudzums nav pateikts un to nevar droši noteikt, neiekļauj pozīciju ar izdomātu daudzumu; tā vietā pievieno assumptions ierakstu par trūkstošo daudzumu.
- Ļoti svarīgi: izmērs/specifikācija nav daudzums. Piemēram, “50 mm metāla karkasa starpsiena 87 m²” nozīmē specifikāciju 50 mm un daudzumu 87 m².
- “2 kārtas” ir darba specifikācija, nevis daudzums 2 gab. Ja katalogā ir atbilstoša pozīcija 2 kārtām, izvēlies to; ja nav, pievieno pie notes.
- Saglabā lietotāja norādīto mērvienību, ja tā sakrīt ar kataloga vienību. Ja kataloga vienība atšķiras, neizdomā konversiju; izvēlies piemērotāku pozīciju vai catalogId=0.
- Cilvēku skaits un dienu skaits ir darba organizācijas informācija, nevis automātiski darba daudzums. Nepārvērt tos par m²/gab.
- Nepievieno tipiskus papildu darbus tikai tāpēc, ka tie parasti tiek veikti. Pievieno tikai lietotāja tekstā minētos darbus.
- Ja lietotājs min vairākus atsevišķus darbus vienā rindkopā, izveido vairākas pozīcijas.
- confidence ir 0 līdz 1. Zema pārliecība jāizskaidro notes vai assumptions.
- Nekad nerēķini cenas un nemaini kataloga cenas. Cenas tiks paņemtas no lietotāja kataloga pēc AI atbildes.
- Atbildi tikai atbilstoši JSON shēmai.

KATALOGS:
${JSON.stringify(safeCatalog)}

LIETOTĀJA OBJEKTA APRAKSTS:
${text}`;

    const upstream=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:MODEL,
        store:false,
        input:[{role:'user',content:instructions}],
        text:{format:{type:'json_schema',name:'construction_estimate',strict:true,schema}},
        max_output_tokens:3000
      })
    });
    const data=await upstream.json();
    if(!upstream.ok){
      const msg=data?.error?.message||`OpenAI API kļūda (${upstream.status})`;
      return json(res,502,{error:msg,code:data?.error?.code||null});
    }
    let raw=data?.output_text;
    if(!raw){
      const chunks=[];
      for(const item of (data?.output||[])) for(const part of (item?.content||[])) if(part?.type==='output_text') chunks.push(part.text||'');
      raw=chunks.join('');
    }
    if(!raw) return json(res,502,{error:'AI neatgrieza teksta rezultātu.'});
    let result;
    try{result=JSON.parse(raw)}catch(e){return json(res,502,{error:'AI atgrieza nederīgu JSON struktūru.'});}

    const allowed=new Set(safeCatalog.map(x=>x.id));
    result.items=(Array.isArray(result.items)?result.items:[]).map(item=>{
      const id=Number(item.catalogId)||0;
      return {...item,catalogId:(id&&allowed.has(id))?id:0,qty:Number(item.qty)||0,confidence:Math.max(0,Math.min(1,Number(item.confidence)||0))};
    }).filter(item=>item.qty>0);
    result.assumptions=Array.isArray(result.assumptions)?result.assumptions.map(String):[];
    return json(res,200,{result,model:MODEL});
  }catch(err){
    console.error('estimate error',err);
    return json(res,500,{error:err?.message||'Servera kļūda Smart Estimate.'});
  }
}
