// Vercel Serverless Function
// 收前端送來的「問卷資料 + PDF(base64)」，用 Resend 寄信給設計師。
// 需要環境變數：
//   RESEND_API_KEY  — Resend 後台取得
//   MAIL_FROM       — 已在 Resend 驗證網域的寄件者，如 "Reason Design 問卷 <noreply@reasondesign.com.tw>"
//                     （未設定時退回 Resend 測試網域 onboarding@resend.dev，只能寄給自己驗證的信箱）
//   MAIL_TO         — 收件者，預設 info@reasondesign.com.tw

function arr(v){ return Array.isArray(v) ? v : (v ? [v] : []); }

function row(label, value){
  if(!value && value !== 0) return '';
  return `<tr><td style="padding:6px 14px 6px 0;color:#A8A098;font-size:12px;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:6px 0;color:#2B2B2B;font-size:14px">${value}</td></tr>`;
}

function buildSummary(d){
  const name = d.f_name || '未具名';
  const date = d.f_date || '';
  const contact = [
    d.f_phone ? `電話 ${d.f_phone}` : '',
    d.f_email ? `Email ${d.f_email}` : '',
    d.f_line ? `LINE ${d.f_line}` : '',
  ].filter(Boolean).join('　|　');

  const layout = [
    d.f_area ? `${d.f_area} 坪` : '',
    (d.f_room || d.f_hall || d.f_bath) ? `${d.f_room||0}房${d.f_hall||0}廳${d.f_bath||0}衛` : '',
    arr(d.housing_type).join('、'),
  ].filter(Boolean).join('　|　');

  const family = [
    d.f_adults ? `成人 ${d.f_adults}` : '',
    (d.f_kids && +d.f_kids>0) ? `孩童 ${d.f_kids}` : '',
    (d.f_elders && +d.f_elders>0) ? `長輩 ${d.f_elders}` : '',
    d.f_pet_type ? `寵物 ${d.f_pet_type}${d.f_pet_count?(' '+d.f_pet_count):''}` : '',
  ].filter(Boolean).join('　|　');

  const style = arr(d.style_dir).join('、');
  const feeling = arr(d.feeling_want).slice(0,6).join('、');
  const pains = arr(d.pain_points).join('、');

  return `
  <div style="font-family:'Noto Sans TC',-apple-system,'PingFang TC',sans-serif;max-width:600px;margin:0 auto;color:#2B2B2B">
    <div style="border-bottom:2px solid #2B2B2B;padding-bottom:12px;margin-bottom:18px">
      <div style="font-size:11px;letter-spacing:0.2em;color:#A8A098;text-transform:uppercase">Reason Design · 新問卷通知</div>
      <div style="font-size:22px;font-weight:600;margin-top:6px">${name}　<span style="font-size:13px;color:#A8A098;font-weight:400">${date}</span></div>
    </div>

    <div style="background:#F6F4F1;border-radius:8px;padding:14px 18px;margin-bottom:18px">
      <div style="font-size:11px;letter-spacing:0.15em;color:#A8A098;margin-bottom:6px">聯絡資訊</div>
      <div style="font-size:14px;line-height:1.7">${contact || '—'}</div>
      ${d.f_address ? `<div style="font-size:13px;color:#6B6359;margin-top:4px">地址 / 社區：${d.f_address}</div>` : ''}
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
      ${row('房屋資訊', layout)}
      ${row('預算方向', d.budget)}
      ${row('家庭成員', family)}
      ${row('規劃空間', arr(d.spaces).join('、'))}
      ${row('風格方向', style)}
      ${row('期待感受', feeling)}
      ${row('現況痛點', pains)}
      ${row('一句話描述', d.f_one_sentence ? `「${d.f_one_sentence}」` : '')}
      ${row('最期待的改變', d.f_biggest_change)}
      ${row('特殊需求', d.f_special_needs)}
      ${row('想保留的物件', d.f_preserve)}
      ${row('喜歡的品牌', d.f_like_brands)}
      ${row('想避免的元素', d.f_avoid)}
      ${row('參考連結', d.f_ref_links)}
      ${row('其他想說', d.f_final_note)}
    </table>

    <div style="margin-top:20px;padding-top:14px;border-top:1px solid #E5E1DC;font-size:12px;color:#A8A098">
      完整《生活與空間診斷書》PDF 已附於此信附件。<br>
      此信由若善設計線上問卷系統自動寄出。
    </div>
  </div>`;
}

export default async function handler(req, res){
  if(req.method !== 'POST'){
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try{
    const { data, emailHtml, pdfs, pdfBase64, filename } = req.body || {};
    if(!data || typeof data !== 'object'){
      res.status(400).json({ error: 'Missing data' });
      return;
    }

    const apiKey = process.env.RESEND_API_KEY;
    if(!apiKey){
      res.status(500).json({ error: 'RESEND_API_KEY not configured' });
      return;
    }

    const name = data.f_name || '未具名';
    const date = data.f_date || new Date().toISOString().split('T')[0];

    const attachments = [];
    if(Array.isArray(pdfs)){
      // 新版：可附多份（完整需求紀錄表 + 診斷書）
      for(const p of pdfs){
        if(p && p.content && p.content.length > 100){
          attachments.push({ filename: p.filename || 'document.pdf', content: p.content });
        }
      }
    } else if(pdfBase64 && pdfBase64.length > 100){
      // 舊版相容：單一附件
      attachments.push({
        filename: filename || `若善設計_診斷書_${name}.pdf`,
        content: pdfBase64,            // 純 base64（前端已去掉 data: 前綴）
      });
    }

    const payload = {
      from: process.env.MAIL_FROM || 'Reason Design <onboarding@resend.dev>',
      to: [process.env.MAIL_TO || 'info@reasondesign.com.tw'],
      subject: `【新問卷】${name}・${date}`,
      html: (typeof emailHtml === 'string' && emailHtml.length > 50) ? emailHtml : buildSummary(data),
      attachments,
    };
    if(data.f_email) payload.reply_to = data.f_email;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if(!r.ok){
      const detail = await r.text();
      console.error('Resend send failed', r.status, detail);
      res.status(502).json({ error: 'Email send failed', status: r.status, detail });
      return;
    }

    res.status(200).json({ ok: true });
  }catch(e){
    res.status(500).json({ error: String(e && e.message || e) });
  }
}
