// Intermediário seguro LB — geração de anúncios com IA (texto + leitura de foto)
// Usa a API do Google Gemini. A chave fica na variável de ambiente GEMINI_API_KEY (na Vercel, nunca no código)

const NOMES_MK = { shopee: 'Shopee', ml: 'Mercado Livre', tiktok: 'TikTok Shop' };
const MODELO_TEXTO = 'gemini-3.6-flash';

const REGRAS_TITULO = {
  shopee: `REGRAS DO TÍTULO (Shopee) - siga TODAS com rigor:
1. CAPITALIZAÇÃO: use Iniciais Maiúsculas em Cada Palavra Importante (substantivos, adjetivos). Ex: "Vestido Feminino Longo Estampado Manga Bufante". Nunca escreva o título todo em minúsculas.
2. ESTRATÉGIA DE SEO (o mais importante): NÃO copie a descrição do vendedor. Você é um especialista - PENSE em como o cliente busca na Shopee e ENRIQUEÇA o título com palavras-chave de busca reais que o vendedor não escreveu. Ex: se ele diz "vestido de passaros", você pensa em termos como "Vestido Midi Floral Boho Chic Moda Feminina Verão" conforme o que realmente aparece. Adicione sinônimos e termos que ampliam o alcance (ex: "Roupa Feminina", "Moda", "Elegante", "Casual", conforme o produto).
3. Aproveite ao máximo os 100 caracteres - um título curto demais desperdiça espaço de busca. Busque usar entre 70 e 100 caracteres.
4. Comece pelo tipo de produto + característica principal, depois vá agregando palavras-chave estratégicas.
5. PROIBIDO: cores (amarelo, rosa, lilás, azul...) e tamanhos (P, M, G, GG). NUNCA inclua cor nem tamanho.
6. Sem emojis, sem CAIXA ALTA total, sem símbolos.`,
  ml: `REGRAS DO TÍTULO (Mercado Livre) - siga TODAS com rigor:
1. CAPITALIZAÇÃO: use Iniciais Maiúsculas nas Palavras Importantes. Nunca tudo minúsculo.
2. ESTRATÉGIA: não copie a descrição do vendedor. Pense como o cliente busca no Mercado Livre e use as palavras-chave mais fortes e diretas. O ML valoriza títulos objetivos e bem ranqueados.
3. Máximo 60 caracteres - respeite bem esse limite, priorizando os termos de maior busca.
4. Comece pelo termo principal que o cliente busca, seguido das características mais relevantes.
5. Sem emojis, sem CAIXA ALTA total, sem símbolos.`,
  tiktok: `REGRAS DO TÍTULO (TikTok Shop) - siga TODAS com rigor:
1. TAMANHO OBRIGATÓRIO: o título deve ter ENTRE 120 E 140 CARACTERES (mire perto de 130-135 pra ter folga). Isso não é opcional - conte os caracteres e ajuste até cair nessa faixa. Um título curto demais é um ERRO GRAVE nessa plataforma.
2. CAPITALIZAÇÃO: use Iniciais Maiúsculas em Cada Palavra Importante (substantivos, adjetivos, marca, modelo).
3. ESTRATÉGIA DE SEO: NÃO copie a descrição do vendedor. O TikTok Shop favorece títulos ricos em informação e palavras-chave de busca - inclua tipo de produto, material, uso, público-alvo, características técnicas e sinônimos de busca relevantes, tudo emendado de forma natural (não é uma lista de palavras soltas, é uma frase corrida rica em informação).
4. Comece pelo tipo de produto + característica principal, e vá agregando detalhes técnicos e palavras-chave até preencher bem a faixa de 100-140 caracteres.
5. Pode incluir cor e tamanho quando fizer sentido pro produto (diferente da Shopee, aqui isso é permitido).
6. Sem emojis, sem CAIXA ALTA total, sem símbolos.`
};

const REGRAS_DESCRICAO = {
  shopee: `REGRAS DA DESCRIÇÃO (Shopee):
- Texto persuasivo, organizado e escaneável.
- Comece com uma frase de impacto sobre o benefício principal, depois desenvolva características, usos e diferenciais.
- Linguagem simples e profissional, em português do Brasil.`,
  ml: `REGRAS DA DESCRIÇÃO (Mercado Livre):
- ATENÇÃO CRÍTICA: a descrição deve ser 100% TEXTO PURO. É TERMINANTEMENTE PROIBIDO usar qualquer emoji, qualquer ícone, qualquer código HTML ou qualquer símbolo especial. Use SOMENTE letras, números e pontuação comum (ponto, vírgula, hífen).
- Texto persuasivo, organizado e escaneável, com parágrafos.
- Comece com uma frase de impacto sobre o benefício principal, depois desenvolva características, usos e diferenciais.
- Linguagem simples e profissional, em português do Brasil.`,
  tiktok: `REGRAS DA DESCRIÇÃO (TikTok Shop):
- Texto rico em informação, organizado em parágrafos curtos e escaneáveis.
- Comece com uma frase de impacto sobre o benefício principal, depois desenvolva características técnicas, materiais, usos e diferenciais com bastante detalhe (o comprador do TikTok Shop valoriza descrições completas).
- Linguagem simples, direta e profissional, em português do Brasil.`
};

function parseDataUrl(dataUrl) {
  const match = /^data:(.+?);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const chave = process.env.GEMINI_API_KEY;
  if (!chave) return res.status(500).json({ erro: 'Chave do Gemini não configurada na Vercel.' });

  try {
    const { produto, marketplace, imagem } = req.body || {};
    if ((!produto || !produto.trim()) && !imagem) {
      return res.status(400).json({ erro: 'Descreva o produto ou envie uma foto.' });
    }

    const mk = NOMES_MK[marketplace] ? marketplace : 'shopee';
    const nomeMk = NOMES_MK[mk];
    const regraTitulo = REGRAS_TITULO[mk];
    const regraDescricao = REGRAS_DESCRICAO[mk];

    const systemPrompt = `Você é um ESTRATEGISTA sênior de SEO e copywriting para marketplaces brasileiros, especialista em ${nomeMk}. Seu trabalho NÃO é repetir o que o vendedor escreveu - é TRANSFORMAR a informação do produto em um anúncio otimizado, rico em palavras-chave de busca reais, que rankeia no topo e vende. Você conhece profundamente como o cliente pesquisa em cada plataforma e sempre agrega termos estratégicos que o vendedor não pensou. Copiar a descrição do vendedor é um ERRO GRAVE - você sempre eleva e enriquece.

Se uma imagem do produto for enviada, analise-a com atenção: identifique modelo, tipo de peça, detalhes visíveis (estampa, tecido aparente, acabamento) e use essas informações reais para deixar o anúncio mais fiel e preciso.

${regraTitulo}

${regraDescricao}

REGRAS DOS BULLET POINTS:
- Exatamente 5 destaques curtos, cada um começando com ✓.
- Foque em benefícios concretos (não repita o óbvio).
- Os bullets podem mencionar cores e tamanhos normalmente (a restrição de cor/tamanho vale só para o título da Shopee).

Responda SOMENTE com um JSON válido, sem texto antes ou depois, no formato:
{"titulo":"...","bullets":["✓ ...","✓ ...","✓ ...","✓ ...","✓ ..."],"descricao":"..."}`;

    const textoUsuario = produto && produto.trim()
      ? `Crie o anúncio para ${nomeMk} deste produto:\n\n${produto}`
      : `Crie o anúncio para ${nomeMk} do produto mostrado na imagem.`;

    const imagemParsed = imagem ? parseDataUrl(imagem) : null;
    const parts = [{ text: systemPrompt + '\n\n' + textoUsuario }];
    if (imagemParsed) parts.push({ inline_data: { mime_type: imagemParsed.mimeType, data: imagemParsed.data } });

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_TEXTO}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' }
      })
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ erro: 'Erro no Gemini: ' + err.slice(0, 200) });
    }

    const data = await r.json();
    const conteudo = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let parsed;
    try { parsed = JSON.parse(conteudo); } catch { return res.status(500).json({ erro: 'Resposta inválida da IA.' }); }

    const FAIXA_TITULO = { shopee: [70, 100], ml: [1, 60], tiktok: [120, 140] };
    const [minTitulo, maxTitulo] = FAIXA_TITULO[mk] || [1, 999];
    let titulo = parsed.titulo || '';

    for (let tentativa = 0; tentativa < 3 && (titulo.length < minTitulo || titulo.length > maxTitulo); tentativa++) {
      const faltam = minTitulo - titulo.length;
      const pedidoCorrecao = titulo.length < minTitulo
        ? `O título abaixo tem exatamente ${titulo.length} caracteres, mas PRECISA ter no mínimo ${minTitulo} e no máximo ${maxTitulo} caracteres — ou seja, faltam pelo menos ${faltam} caracteres. Reescreva-o mais longo, adicionando MAIS palavras-chave relevantes de busca (características técnicas, material, uso, público-alvo, sinônimos), mantendo a mesma capitalização e estilo. Conte os caracteres do que você escrever antes de responder. Título atual: "${titulo}". Responda SOMENTE com um JSON no formato {"titulo":"..."}`
        : `O título abaixo tem ${titulo.length} caracteres, mas PRECISA ter no máximo ${maxTitulo} caracteres. Reescreva-o mais curto, removendo o que for menos relevante, mantendo as palavras-chave mais importantes. Título atual: "${titulo}". Responda SOMENTE com um JSON no formato {"titulo":"..."}`;

      try {
        const r2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_TEXTO}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `Você é um especialista em títulos de anúncios para ${nomeMk}. Responda somente com JSON válido.\n\n${pedidoCorrecao}` }] }],
            generationConfig: { temperature: 0.6, responseMimeType: 'application/json' }
          })
        });
        if (r2.ok) {
          const data2 = await r2.json();
          const conteudo2 = data2.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const parsed2 = JSON.parse(conteudo2);
          if (parsed2.titulo) titulo = parsed2.titulo;
        } else { break; }
      } catch (e) { break; }
    }

    parsed.titulo = titulo;
    return res.status(200).json({ ok: true, ...parsed, marketplace: mk });
  } catch (e) {
    return res.status(500).json({ erro: 'Erro interno: ' + (e.message || 'desconhecido') });
  }
}
