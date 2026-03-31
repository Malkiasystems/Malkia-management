import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body;
  console.log('WATI RAW PAYLOAD:', JSON.stringify(body, null, 2));

  try {
    let phone: string | null = null;
    let messageText = '';
    let customerName = '';
    let messageId = '';

    if (body?.waId) {
      phone = body.waId;
      messageText = body?.text?.body || body?.message || '';
      customerName = body?.senderName || body?.contactName || phone;
      messageId = body?.id || body?.wamid || '';
    } else if (body?.contact?.wa_id) {
      phone = body.contact.wa_id;
      customerName = body?.contact?.name || phone;
      const msg = body?.messages?.[0];
      messageText = msg?.text?.body || '';
      messageId = msg?.id || '';
    } else if (body?.data?.waId) {
      phone = body.data.waId;
      messageText = body?.data?.text?.body || body?.data?.message || '';
      customerName = body?.data?.senderName || phone;
      messageId = body?.data?.id || '';
    }

    console.log('Parsed - phone:', phone, 'message:', messageText, 'name:', customerName);

    if (!phone) {
      console.log('No phone found - skipping. Event type:', body?.type || body?.eventType);
      return res.status(200).json({ status: 'skipped - no phone' });
    }

    const { data: existing, error: findError } = await supabase
      .from('wati_conversations')
      .select('id, unread_count')
      .eq('phone_number', phone)
      .maybeSingle();

    if (findError) console.error('Error finding conversation:', findError);

    let conversationId: string | null = null;

    if (existing) {
      conversationId = existing.id;
      const { error: updateError } = await supabase
        .from('wati_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          unread_count: (existing.unread_count || 0) + 1,
          customer_name: customerName,
          status: 'open',
        })
        .eq('id', conversationId);
      if (updateError) console.error('Error updating conversation:', updateError);
    } else {
      const { data: customer } = await supabase
        .from('customers')
        .select('id, name')
        .or(`phone.eq.${phone},phone.eq.+${phone}`)
        .maybeSingle();

      const { data: newConv, error: insertError } = await supabase
        .from('wati_conversations')
        .insert({
          phone_number: phone,
          customer_name: customer?.name || customerName,
          customer_id: customer?.id || null,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
          status: 'open',
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Error creating conversation:', insertError);
      } else {
        conversationId = newConv?.id;
        console.log('Created conversation:', conversationId);
      }
    }

    if (conversationId && messageText) {
      const { error: msgError } = await supabase.from('wati_messages').insert({
        conversation_id: conversationId,
        content: messageText,
        sender: 'customer',
        message_type: 'text',
        is_read: false,
        wati_message_id: messageId,
      });
      if (msgError) console.error('Error storing message:', msgError);
      else console.log('Message stored successfully');
    }

    return res.status(200).json({ status: 'ok', conversationId });

  } catch (error: any) {
    console.error('WATI webhook CRASH:', error?.message || error);
    return res.status(500).json({ status: 'error', message: error?.message });
  }
}
