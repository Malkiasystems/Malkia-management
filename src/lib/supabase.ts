import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ebokhvibnypiomzqimfg.supabase.co'
const supabaseKey = 'sb_publishable_saT1HG94KaXbphgVVIv9hg_w_dXberP'

export const supabase = createClient(supabaseUrl, supabaseKey)
