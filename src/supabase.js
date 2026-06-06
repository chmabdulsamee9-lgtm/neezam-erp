import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zrdmzmhogykhtrvjdqko.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZG16bWhvZ3lraHRydmpkcWtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MzY0MDksImV4cCI6MjA5NjMxMjQwOX0.gXBNEkD4q40fpc8zjQdh9GCgqJD4S8bpI2xUx2rcPEQ'

export const supabase = createClient(supabaseUrl, supabaseKey)