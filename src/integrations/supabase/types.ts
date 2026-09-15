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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      competitions: {
        Row: {
          code: string
          country: string | null
          created_at: string
          id: string
          name: string
          season: string
          source: string
        }
        Insert: {
          code: string
          country?: string | null
          created_at?: string
          id?: string
          name: string
          season: string
          source?: string
        }
        Update: {
          code?: string
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          season?: string
          source?: string
        }
        Relationships: []
      }
      engine_predictions: {
        Row: {
          brier: number | null
          competition_id: string
          created_at: string
          engine: string
          id: string
          log_loss: number | null
          market: string
          match_id: string
          outcome: boolean | null
          probability: number
          settled_at: string | null
          snapshot_id: string
          status: string
        }
        Insert: {
          brier?: number | null
          competition_id: string
          created_at?: string
          engine: string
          id?: string
          log_loss?: number | null
          market: string
          match_id: string
          outcome?: boolean | null
          probability: number
          settled_at?: string | null
          snapshot_id: string
          status?: string
        }
        Update: {
          brier?: number | null
          competition_id?: string
          created_at?: string
          engine?: string
          id?: string
          log_loss?: number | null
          market?: string
          match_id?: string
          outcome?: boolean | null
          probability?: number
          settled_at?: string | null
          snapshot_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "engine_predictions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engine_predictions_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          created_at: string
          dataset: string
          detail: string | null
          id: string
          matches_ingested: number
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          dataset: string
          detail?: string | null
          id?: string
          matches_ingested?: number
          source: string
          status: string
        }
        Update: {
          created_at?: string
          dataset?: string
          detail?: string | null
          id?: string
          matches_ingested?: number
          source?: string
          status?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          away_team_id: string
          competition_id: string
          created_at: string
          ft_away: number | null
          ft_home: number | null
          home_team_id: string
          ht_away: number | null
          ht_home: number | null
          id: string
          kickoff: string
          round: string | null
          source: string
          status: string
        }
        Insert: {
          away_team_id: string
          competition_id: string
          created_at?: string
          ft_away?: number | null
          ft_home?: number | null
          home_team_id: string
          ht_away?: number | null
          ht_home?: number | null
          id?: string
          kickoff: string
          round?: string | null
          source?: string
          status?: string
        }
        Update: {
          away_team_id?: string
          competition_id?: string
          created_at?: string
          ft_away?: number | null
          ft_home?: number | null
          home_team_id?: string
          ht_away?: number | null
          ht_home?: number | null
          id?: string
          kickoff?: string
          round?: string | null
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          brier: number | null
          confidence: number
          consensus: number
          created_at: string
          fair_odds: number | null
          id: string
          is_headline: boolean
          log_loss: number | null
          market: string
          match_id: string
          outcome: boolean | null
          probability: number
          selection: string
          settled_at: string | null
          snapshot_id: string
          stability: number
          status: string
        }
        Insert: {
          brier?: number | null
          confidence: number
          consensus: number
          created_at?: string
          fair_odds?: number | null
          id?: string
          is_headline?: boolean
          log_loss?: number | null
          market: string
          match_id: string
          outcome?: boolean | null
          probability: number
          selection: string
          settled_at?: string | null
          snapshot_id: string
          stability: number
          status?: string
        }
        Update: {
          brier?: number | null
          confidence?: number
          consensus?: number
          created_at?: string
          fair_odds?: number | null
          id?: string
          is_headline?: boolean
          log_loss?: number | null
          market?: string
          match_id?: string
          outcome?: boolean | null
          probability?: number
          selection?: string
          settled_at?: string | null
          snapshot_id?: string
          stability?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      snapshots: {
        Row: {
          conflicts: Json
          consensus: number
          created_at: string
          data_quality: number
          engines: Json
          evidence: Json
          id: string
          inputs_hash: string
          match_id: string
          probabilities: Json
          reasoning: Json | null
          simulation: Json
          source_health: Json
          stability: number
          verdict: string
          version: string
        }
        Insert: {
          conflicts?: Json
          consensus: number
          created_at?: string
          data_quality: number
          engines: Json
          evidence: Json
          id?: string
          inputs_hash: string
          match_id: string
          probabilities: Json
          reasoning?: Json | null
          simulation: Json
          source_health?: Json
          stability: number
          verdict: string
          version: string
        }
        Update: {
          conflicts?: Json
          consensus?: number
          created_at?: string
          data_quality?: number
          engines?: Json
          evidence?: Json
          id?: string
          inputs_hash?: string
          match_id?: string
          probabilities?: Json
          reasoning?: Json | null
          simulation?: Json
          source_health?: Json
          stability?: number
          verdict?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "snapshots_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          country: string | null
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
