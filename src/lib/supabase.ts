import { createClient } from '@supabase/supabase-js'

const URL = 'https://ebokhvibnypiomzqimfg.supabase.co'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVib2todmlibnlwaW9tenFpbWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzA3MDIsImV4cCI6MjA4OTYwNjcwMn0.yqaB42lvEN_vkUt1q6VBAAHdwSYOaIwt8bH5Vg9MTQk'

export const supabase = createClient(URL, KEY, {
  global: {
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
    }
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
})
