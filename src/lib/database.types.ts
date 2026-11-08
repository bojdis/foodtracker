export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_templates: {
        Row: {
          canonical_name: string
          created_at: string
          default_intensity: string
          default_minutes: number
          icon_key: string
          id: number
          is_hidden: boolean
          is_quick_check: boolean
          last_done_at: string
          max_minutes: number
          met_high: number
          met_light: number
          met_medium: number
          normalized_signature: string
          occurrence_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          canonical_name: string
          created_at?: string
          default_intensity?: string
          default_minutes?: number
          icon_key?: string
          id?: never
          is_hidden?: boolean
          is_quick_check?: boolean
          last_done_at?: string
          max_minutes?: number
          met_high?: number
          met_light?: number
          met_medium?: number
          normalized_signature: string
          occurrence_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          canonical_name?: string
          created_at?: string
          default_intensity?: string
          default_minutes?: number
          icon_key?: string
          id?: never
          is_hidden?: boolean
          is_quick_check?: boolean
          last_done_at?: string
          max_minutes?: number
          met_high?: number
          met_light?: number
          met_medium?: number
          normalized_signature?: string
          occurrence_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      body_measurements: {
        Row: {
          blood_pressure_dia: number | null
          blood_pressure_sys: number | null
          created_at: string
          id: number
          measured_date: string
          notes: string | null
          pulse_bpm: number | null
          updated_at: string
          user_id: string
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          blood_pressure_dia?: number | null
          blood_pressure_sys?: number | null
          created_at?: string
          id?: never
          measured_date: string
          notes?: string | null
          pulse_bpm?: number | null
          updated_at?: string
          user_id: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          blood_pressure_dia?: number | null
          blood_pressure_sys?: number | null
          created_at?: string
          id?: never
          measured_date?: string
          notes?: string | null
          pulse_bpm?: number | null
          updated_at?: string
          user_id?: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      daily_summaries: {
        Row: {
          base_expenditure_kcal: number
          burned_activity_kcal: number
          burned_total_kcal: number
          carbs_g: number
          entries_count: number
          fat_g: number
          fiber_g: number
          id: number
          intake_kcal: number
          log_date: string
          net_kcal: number
          pending_count: number
          protein_g: number
          updated_at: string
          user_id: string
        }
        Insert: {
          base_expenditure_kcal?: number
          burned_activity_kcal?: number
          burned_total_kcal?: number
          carbs_g?: number
          entries_count?: number
          fat_g?: number
          fiber_g?: number
          id?: never
          intake_kcal?: number
          log_date: string
          net_kcal?: number
          pending_count?: number
          protein_g?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          base_expenditure_kcal?: number
          burned_activity_kcal?: number
          burned_total_kcal?: number
          carbs_g?: number
          entries_count?: number
          fat_g?: number
          fiber_g?: number
          id?: never
          intake_kcal?: number
          log_date?: string
          net_kcal?: number
          pending_count?: number
          protein_g?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      entry_items: {
        Row: {
          burned_kcal: number
          canonical_name: string
          carbs_g: number
          confidence: number
          created_at: string
          duration_minutes: number | null
          fat_g: number
          fiber_g: number
          id: number
          item_kind: string
          item_name: string
          kcal: number
          log_entry_id: number
          met_value: number | null
          portion_grams: number | null
          protein_g: number
          user_id: string
        }
        Insert: {
          burned_kcal?: number
          canonical_name: string
          carbs_g?: number
          confidence?: number
          created_at?: string
          duration_minutes?: number | null
          fat_g?: number
          fiber_g?: number
          id?: never
          item_kind: string
          item_name: string
          kcal?: number
          log_entry_id: number
          met_value?: number | null
          portion_grams?: number | null
          protein_g?: number
          user_id: string
        }
        Update: {
          burned_kcal?: number
          canonical_name?: string
          carbs_g?: number
          confidence?: number
          created_at?: string
          duration_minutes?: number | null
          fat_g?: number
          fiber_g?: number
          id?: never
          item_kind?: string
          item_name?: string
          kcal?: number
          log_entry_id?: number
          met_value?: number | null
          portion_grams?: number | null
          protein_g?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entry_items_log_entry_id_fkey"
            columns: ["log_entry_id"]
            isOneToOne: false
            referencedRelation: "log_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      log_entries: {
        Row: {
          activity_template_id: number | null
          ai_notes: string | null
          entry_type: string
          error_message: string | null
          id: number
          log_date: string
          logged_at: string
          meal_template_id: number | null
          processed_at: string | null
          raw_text: string
          status: string
          summary_title: string | null
          time_slot: string
          total_burned_kcal: number
          total_carbs_g: number
          total_fat_g: number
          total_fiber_g: number
          total_intake_kcal: number
          total_protein_g: number
          user_id: string
        }
        Insert: {
          activity_template_id?: number | null
          ai_notes?: string | null
          entry_type?: string
          error_message?: string | null
          id?: never
          log_date: string
          logged_at?: string
          meal_template_id?: number | null
          processed_at?: string | null
          raw_text: string
          status?: string
          summary_title?: string | null
          time_slot?: string
          total_burned_kcal?: number
          total_carbs_g?: number
          total_fat_g?: number
          total_fiber_g?: number
          total_intake_kcal?: number
          total_protein_g?: number
          user_id: string
        }
        Update: {
          activity_template_id?: number | null
          ai_notes?: string | null
          entry_type?: string
          error_message?: string | null
          id?: never
          log_date?: string
          logged_at?: string
          meal_template_id?: number | null
          processed_at?: string | null
          raw_text?: string
          status?: string
          summary_title?: string | null
          time_slot?: string
          total_burned_kcal?: number
          total_carbs_g?: number
          total_fat_g?: number
          total_fiber_g?: number
          total_intake_kcal?: number
          total_protein_g?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_entries_activity_template_id_fkey"
            columns: ["activity_template_id"]
            isOneToOne: false
            referencedRelation: "activity_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_entries_meal_template_id_fkey"
            columns: ["meal_template_id"]
            isOneToOne: false
            referencedRelation: "meal_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_templates: {
        Row: {
          avg_carbs_g: number
          avg_fat_g: number
          avg_fiber_g: number
          avg_kcal: number
          avg_portion_grams: number | null
          avg_protein_g: number
          canonical_name: string
          created_at: string
          embedding: string | null
          id: number
          is_hidden: boolean
          is_quick_check: boolean
          last_eaten_at: string
          normalized_items_summary: string
          occurrence_count: number
          preset_notes: string | null
          shortcut_aliases: string[]
          template_items: Json
          typical_time_slot: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_carbs_g?: number
          avg_fat_g?: number
          avg_fiber_g?: number
          avg_kcal?: number
          avg_portion_grams?: number | null
          avg_protein_g?: number
          canonical_name: string
          created_at?: string
          embedding?: string | null
          id?: never
          is_hidden?: boolean
          is_quick_check?: boolean
          last_eaten_at?: string
          normalized_items_summary?: string
          occurrence_count?: number
          preset_notes?: string | null
          shortcut_aliases?: string[]
          template_items?: Json
          typical_time_slot?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_carbs_g?: number
          avg_fat_g?: number
          avg_fiber_g?: number
          avg_kcal?: number
          avg_portion_grams?: number | null
          avg_protein_g?: number
          canonical_name?: string
          created_at?: string
          embedding?: string | null
          id?: never
          is_hidden?: boolean
          is_quick_check?: boolean
          last_eaten_at?: string
          normalized_items_summary?: string
          occurrence_count?: number
          preset_notes?: string | null
          shortcut_aliases?: string[]
          template_items?: Json
          typical_time_slot?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          activity_level: string
          activity_multiplier: number
          base_expenditure_kcal: number
          birth_year: number
          bmr_kcal: number
          carbs_target_g: number
          created_at: string
          display_name: string
          energy_unit: string
          fat_target_g: number
          fiber_target_g: number
          height_cm: number
          protein_target_g: number
          sex: string
          singleton_lock: boolean
          target_deficit_kcal: number
          target_weight_kg: number | null
          updated_at: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          activity_level?: string
          activity_multiplier?: number
          base_expenditure_kcal: number
          birth_year: number
          bmr_kcal: number
          carbs_target_g?: number
          created_at?: string
          display_name?: string
          energy_unit?: string
          fat_target_g?: number
          fiber_target_g?: number
          height_cm: number
          protein_target_g?: number
          sex?: string
          singleton_lock?: boolean
          target_deficit_kcal?: number
          target_weight_kg?: number | null
          updated_at?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          activity_level?: string
          activity_multiplier?: number
          base_expenditure_kcal?: number
          birth_year?: number
          bmr_kcal?: number
          carbs_target_g?: number
          created_at?: string
          display_name?: string
          energy_unit?: string
          fat_target_g?: number
          fiber_target_g?: number
          height_cm?: number
          protein_target_g?: number
          sex?: string
          singleton_lock?: boolean
          target_deficit_kcal?: number
          target_weight_kg?: number | null
          updated_at?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_owner_user: { Args: never; Returns: boolean }
      is_tracker_initialized: { Args: never; Returns: boolean }
      match_meal_templates: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          avg_carbs_g: number
          avg_fat_g: number
          avg_fiber_g: number
          avg_kcal: number
          avg_protein_g: number
          canonical_name: string
          id: number
          is_quick_check: boolean
          normalized_items_summary: string
          occurrence_count: number
          similarity: number
          template_items: Json
          typical_time_slot: string
        }[]
      }
      recalculate_daily_summary: {
        Args: { p_log_date: string }
        Returns: {
          base_expenditure_kcal: number
          burned_activity_kcal: number
          burned_total_kcal: number
          carbs_g: number
          entries_count: number
          fat_g: number
          fiber_g: number
          id: number
          intake_kcal: number
          log_date: string
          net_kcal: number
          pending_count: number
          protein_g: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "daily_summaries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
