export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      tournaments: {
        Row: {
          id: number
          name: string
          date: string
          location: string
          course: string
          description: string | null
          max_players: number
          created_by: string
          image_url: string | null
          registration_open_date: string | null
          registration_open_time: string | null
          price: number | null
          event_type: string | null
          // Add any other columns you have
        }
        Insert: {
          id?: number
          name: string
          date: string
          location: string
          course: string
          description?: string | null
          max_players: number
          created_by: string
          image_url?: string | null
          registration_open_date?: string | null
          registration_open_time?: string | null
          price?: number | null
          event_type?: string | null
        }
        Update: {
          id?: number
          name?: string
          date?: string
          location?: string
          course?: string
          description?: string | null
          max_players?: number
          created_by?: string
          image_url?: string | null
          registration_open_date?: string | null
          registration_open_time?: string | null
          price?: number | null
          event_type?: string | null
        }
      }
      event_registrations: {
        Row: {
          id: string
          event_id: number
          user_id: string | null
          player_name: string
          player_email: string
          team_name: string | null
          handicap: number | null
          flight: string | null
          paid: boolean
          checked_in: boolean
          addons_selected: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: number
          user_id?: string | null
          player_name: string
          player_email: string
          team_name?: string | null
          handicap?: number | null
          flight?: string | null
          paid?: boolean
          checked_in?: boolean
          addons_selected?: Json | null
        }
        Update: {
          paid?: boolean
          checked_in?: boolean
          // etc.
        }
      }
      event_addons: {
        Row: {
          id: number
          event_id: number
          name: string
          quantity_available: number
          price_per_unit: number
        }
        Insert: {
          id?: number
          event_id: number
          name: string
          quantity_available: number
          price_per_unit: number
        }
      }
    }
  }
}