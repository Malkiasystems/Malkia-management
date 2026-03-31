import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;
    console.log('WATI webhook received:', JSON.stringify(body));

    // Handle different event types
    const eventType = body?.type || body?.eventType;

    if (eventType === 'message' || body?.waId) {
      // Incoming message from customer
      const phone = body.waId || body.phone;
      const messageText = body.text?.body || body.message || '';
      const customerName = body.senderName || body.contactName || phone;
      const messageId = body.id || body.messageId;

      if (!phone) {
        return res.status(200).json({ status: 'ignored - no phone' });
      }

      // Find or create conversation
      const { data: existing } = await supabase
        .from('wati_conversations')
        .select('id, unread_count')
        .eq('phone_number', phone)
        .single();

      let conversationId;

      if (existing) {
        conversationId = existing.id;
        await supabase
          .from('wati_conversations')
          .update({
            last_message_at: new Date().toISOString(),
            unread_count: (existing.unread_count || 0) + 1,
            customer_name: customerName,
            status: 'open',
          })
          .eq('id', conversationId);
      } else {
        // Try to link to existing customer by phone
        const { data: customer } = await supabase
          .from('customers')
          .select('id, name')
          .or(`phone.eq.${phone},phone.eq.+${phone}`)
          .single();

        const { data: newConv } = await supabase
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

        conversationId = newConv?.id;
      }

      // Store the message
      if (conversationId && messageText) {
        await supabase.from('wati_messages').insert({
          conversation_id: conversationId,
          content: messageText,
          sender: 'customer',
          message_type: 'text',
          is_read: false,
          wati_message_id: messageId,
        });
      }
    }

    // Always return 200 to WATI
    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('WATI webhook error:', error);
    // Still return 200 to prevent WATI retries flooding
    return res.status(200).json({ status: 'error logged' });
  }
}
