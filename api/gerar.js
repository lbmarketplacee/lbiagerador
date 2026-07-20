// Intermediário seguro LB — protege a chave da OpenAI
// A chave fica na variável de ambiente OPENAI_API_KEY (configurada na Vercel, nunca no código)

export default async function handler(req, res) {
  // Libera o acesso a partir do sistema da LB
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const chave = process.env.OPENAI_API_KEY;
  if (!chave) return res.status(500).json({ erro: 'Chave da OpenAI não configurada na Vercel.' });

  try {
    const { produto, marketplace } = req.body || {};
    if (!produto || !produto.trim()) return res.status(400).json({ erro: 'Descreva o produto.' });

    const nomeMk = marketplace === 'shopee' ? 'Shopee' : 'Mercado Livre';
    const limiteTitulo = marketplace === 'shopee' ? 100 : 60;

    const systemPrompt = `Você é um especialista sênior em criação de anúncios de alta conversão para marketplaces brasileiros, com foco em ${nomeMk}. Você domina o algoritmo de busca de cada plataforma e sabe escrever títulos e descrições que rankeiam bem e vendem.

REGRAS DO TÍTULO (${nomeMk}):
- Máximo ${limiteTitulo} caracteres.
- Comece com o termo principal que o cliente busca, seguido de características (cor, tamanho, material, uso).
- Sem emojis, sem CAIXA ALTA exagerada, sem símbolos.
- Rico em palavras-chave, mas natural.

REGRAS DA DESCRIÇÃO (${nomeMk}):
- Texto persuasivo, organizado, escaneável.
- Comece com uma frase de impacto sobre o benefício principal.
- Depois desenvolva características, usos e diferenciais.
- Linguagem simples e profissional, em português do Brasil.

REGRAS DOS BULLET POINTS:
- Exatamente 5 destaques curtos, cada um começando com ✓.
- Foque em benefícios concretos (não repita o óbvio).

Responda SOMENTE com um JSON válido, sem texto antes ou depois, no formato:
{"titulo":"...","bullets":["✓ ...","✓ ...","✓ ...","✓ ...","✓ ..."],"descricao":"..."}`;

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + chave },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Crie o anúncio para ${nomeMk} deste produto:\n\n${produto}` }
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' }
      })
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ erro: 'Erro na OpenAI: ' + err.slice(0, 200) });
    }

    const data = await r.json();
    const conteudo = data.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(conteudo); } catch { return res.status(500).json({ erro: 'Resposta inválida da IA.' }); }

    return res.status(200).json({ ok: true, ...parsed, marketplace });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro interno: ' + (e.message || 'desconhecido') });
  }
}
