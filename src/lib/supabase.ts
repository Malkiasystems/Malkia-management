import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ebokhvibnypiomzqimfg.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVib2todmlibnlwaW9tenFpbWZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMzA3MDIsImV4cCI6MjA4OTYwNjcwMn0.yqaB42lvEN_vkUt1q6VBAAHdwSYOaIwt8bH5Vg9MTQk'

export const supabase = createClient(supabaseUrl, supabaseKey)
