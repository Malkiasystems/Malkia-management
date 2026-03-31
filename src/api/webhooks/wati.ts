/**
 * WATI Webhook Handler
 * Receives WhatsApp messages from WATI API
 * Stores in Supabase and updates conversations
 * 
 * Endpoint: POST /api/webhooks/wati
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface WATIMessage {
  id?: string;
  source?: string;
  messageNumber?: string;
  type?: string;
  body?: string;
  timestamp?: number;
  externalId?: string;
  conversationId?: string;
  messageContact?: {
    defaultPhone?: string;
    profileName?: string;
  };
}

export default async function handler(req: any, res: any) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;
    console.log('[WATI Webhook] Received payload:', JSON.stringify(payload, null, 2));

    // Verify webhook signature (if WATI provides one)
    // const signature = req.headers['x-wati-signature'];
    // if (!verifySignature(payload, signature)) {
    //   return res.status(401).json({ error: 'Invalid signature' });
    // }

    // Handle incoming messages
    if (payload.messages && payload.messages.length > 0) {
      for (const msg of payload.messages) {
        await handleIncomingMessage(msg);
      }
    }

    // Handle message status updates (delivered, read, etc)
    if (payload.statuses && payload.statuses.length > 0) {
      for (const status of payload.statuses) {
        await handleStatusUpdate(status);
      }
    }

    // Return 200 OK to WATI
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[WATI Webhook] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Handle incoming WhatsApp message from WATI
 */
async function handleIncomingMessage(msg: WATIMessage) {
  try {
    // Extract message data
    const phoneNumber = msg.messageContact?.defaultPhone || msg.source;
    const customerName = msg.messageContact?.profileName || 'Customer';
    const messageText = msg.body || '';
    const watiMessageId = msg.id || msg.externalId || '';
    const timestamp = msg.timestamp || Date.now();

    if (!phoneNumber || !messageText) {
      console.log('[WATI] Skipping message: missing phone or text');
      return;
    }

    console.log(`[WATI] Processing message from ${phoneNumber}`);

    // Step 1: Find or create customer
    let customerId: string | null = null;
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id, name')
      .eq('whatsapp', phoneNumber.replace(/[\s+\-()]/g, ''))
      .single();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      console.log(`[WATI] Linked to existing customer: ${existingCustomer.id}`);
    } else {
      // Create new customer
      const { data: newCustomer, error: createError } = await supabase
        .from('customers')
        .insert({
          name: customerName,
          whatsapp: phoneNumber.replace(/[\s+\-()]/g, ''),
          customer_type: 'whatsapp',
          segment: 'retail',
          is_active: true
        })
        .select('id')
        .single();

      if (!createError && newCustomer) {
        customerId = newCustomer.id;
        console.log(`[WATI] Created new customer: ${newCustomer.id}`);
      } else {
        console.error('[WATI] Failed to create customer:', createError);
      }
    }

    // Step 2: Find or create conversation
    const cleanPhone = phoneNumber.replace(/[\s+\-()]/g, '');
    const { data: existingConvo } = await supabase
      .from('wati_conversations')
      .select('id')
      .eq('phone_number', cleanPhone)
      .single();

    let conversationId: string;

    if (existingConvo) {
      conversationId = existingConvo.id;
      // Update last_message_at and increment unread count
      await supabase
        .from('wati_conversations')
        .update({
          last_message_at: new Date(timestamp).toISOString(),
          unread_count: supabase.rpc('increment_unread')
        })
        .eq('id', conversationId);
      console.log(`[WATI] Updated existing conversation: ${conversationId}`);
    } else {
      // Create new conversation
      const { data: newConvo, error: convoError } = await supabase
        .from('wati_conversations')
        .insert({
          phone_number: cleanPhone,
          customer_id: customerId,
          customer_name: customerName,
          last_message_at: new Date(timestamp).toISOString(),
          unread_count: 1,
          status: 'open',
          wati_id: msg.conversationId || cleanPhone
        })
        .select('id')
        .single();

      if (convoError || !newConvo) {
        console.error('[WATI] Failed to create conversation:', convoError);
        return;
      }

      conversationId = newConvo.id;
      console.log(`[WATI] Created new conversation: ${conversationId}`);
    }

    // Step 3: Store message in database
    const { error: msgError } = await supabase.from('wati_messages').insert({
      conversation_id: conversationId,
      message_type: 'text',
      content: messageText,
      sender: 'customer',
      wati_message_id: watiMessageId,
      is_read: false,
      created_at: new Date(timestamp).toISOString()
    });

    if (msgError) {
      console.error('[WATI] Failed to store message:', msgError);
      return;
    }

    console.log(`[WATI] Message stored successfully`);

    // Step 4: Emit real-time event (optional - for live updates)
    // supabase.channel(`conversation:${conversationId}`).send('broadcast', {
    //   event: 'new_message',
    //   data: { conversationId, messageText }
    // });

  } catch (error) {
    console.error('[WATI] Error processing message:', error);
  }
}

/**
 * Handle message status updates (delivered, read, etc)
 */
async function handleStatusUpdate(status: any) {
  try {
    const { externalId, status: msgStatus } = status;

    console.log(`[WATI] Status update for message ${externalId}: ${msgStatus}`);

    if (msgStatus === 'read') {
      // Mark message as read
      await supabase
        .from('wati_messages')
        .update({ is_read: true })
        .eq('wati_message_id', externalId);

      console.log(`[WATI] Marked message ${externalId} as read`);
    }
  } catch (error) {
    console.error('[WATI] Error processing status update:', error);
  }
}
