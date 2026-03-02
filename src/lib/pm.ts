import { supabase } from '@/lib/supabase'
import { Region } from '@/types'

export interface PM {
  id: string
  name: string
  region: Region
  created_at: string
}

export async function getPMs(): Promise<PM[]> {
  const { data } = await supabase.from('pms').select('*').order('name')
  return data || []
}

export async function addPM(name: string, region: Region): Promise<void> {
  await supabase.from('pms').insert({ name, region, created_at: new Date().toISOString() })
}

export async function removePM(id: string): Promise<void> {
  await supabase.from('pms').delete().eq('id', id)
}

export async function updatePM(id: string, name: string): Promise<void> {
  await supabase.from('pms').update({ name }).eq('id', id)
}
