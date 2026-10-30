// Generated from the Supabase schema (supabase gen types typescript). Do not edit by hand.
// Regenerate after a migration: npm run gen:types (needs SUPABASE_PROJECT_REF and a logged-in Supabase CLI).

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
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string
          dismissed_at: string | null
          from_id: string
          id: string
          to_id: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          from_id: string
          id?: string
          to_id: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          from_id?: string
          id?: string
          to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      grid_squares: {
        Row: {
          cluster: string
          grid_id: string
          hint: string
          idx: number
          prompt: string
        }
        Insert: {
          cluster?: string
          grid_id: string
          hint?: string
          idx: number
          prompt: string
        }
        Update: {
          cluster?: string
          grid_id?: string
          hint?: string
          idx?: number
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "grid_squares_grid_id_fkey"
            columns: ["grid_id"]
            isOneToOne: false
            referencedRelation: "grids"
            referencedColumns: ["id"]
          },
        ]
      }
      grids: {
        Row: {
          author_id: string | null
          color: string
          cols: number
          created_at: string
          description: string
          hidden_at: string | null
          id: string
          is_hidden: boolean
          is_official: boolean
          is_public: boolean
          made_by: string
          prerequisite_grid_id: string | null
          reveal_icon: string
          rows: number
          server_updated_at: string
          shared_at: string | null
          size: string
          theme: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          color: string
          cols: number
          created_at?: string
          description?: string
          hidden_at?: string | null
          id: string
          is_hidden?: boolean
          is_official?: boolean
          is_public?: boolean
          made_by?: string
          prerequisite_grid_id?: string | null
          reveal_icon?: string
          rows: number
          server_updated_at?: string
          shared_at?: string | null
          size: string
          theme: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          color?: string
          cols?: number
          created_at?: string
          description?: string
          hidden_at?: string | null
          id?: string
          is_hidden?: boolean
          is_official?: boolean
          is_public?: boolean
          made_by?: string
          prerequisite_grid_id?: string | null
          reveal_icon?: string
          rows?: number
          server_updated_at?: string
          shared_at?: string | null
          size?: string
          theme?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grids_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grids_prerequisite_grid_id_fkey"
            columns: ["prerequisite_grid_id"]
            isOneToOne: false
            referencedRelation: "grids"
            referencedColumns: ["id"]
          },
        ]
      }
      group_invites: {
        Row: {
          created_at: string
          from_id: string
          group_id: string
          to_id: string
        }
        Insert: {
          created_at?: string
          from_id: string
          group_id: string
          to_id: string
        }
        Update: {
          created_at?: string
          from_id?: string
          group_id?: string
          to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_invites_from_id_fkey"
            columns: ["from_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "user_grids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_invites_to_id_fkey"
            columns: ["to_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          group_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "user_grids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      group_unshares: {
        Row: {
          group_id: string
          id: number
          row_id: string
          row_table: string
          server_updated_at: string
        }
        Insert: {
          group_id: string
          id?: number
          row_id: string
          row_table: string
          server_updated_at?: string
        }
        Update: {
          group_id?: string
          id?: number
          row_id?: string
          row_table?: string
          server_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_unshares_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "user_grids"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_moments: {
        Row: {
          hidden_at: string
          hidden_by: string | null
          moment_id: string
          owner_id: string
        }
        Insert: {
          hidden_at?: string
          hidden_by?: string | null
          moment_id: string
          owner_id: string
        }
        Update: {
          hidden_at?: string
          hidden_by?: string | null
          moment_id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_moments_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_moments_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: true
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_moments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_entries: {
        Row: {
          audience: string
          body: string
          created_at: string
          deleted_at: string | null
          group_id: string
          id: string
          moment_id: string
          server_updated_at: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          audience?: string
          body?: string
          created_at: string
          deleted_at?: string | null
          group_id: string
          id: string
          moment_id: string
          server_updated_at?: string
          updated_at: string
          user_id?: string | null
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          group_id?: string
          id?: string
          moment_id?: string
          server_updated_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moment_entries_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      moments: {
        Row: {
          audience: string
          body: string
          created_at: string
          deleted_at: string | null
          fill: string
          group_id: string | null
          happened_on: string
          id: string
          place: string
          server_updated_at: string
          square_state_id: string
          title: string
          updated_at: string
          user_id: string | null
          weather: string
          with_people: string
        }
        Insert: {
          audience?: string
          body?: string
          created_at: string
          deleted_at?: string | null
          fill?: string
          group_id?: string | null
          happened_on: string
          id: string
          place?: string
          server_updated_at?: string
          square_state_id: string
          title: string
          updated_at: string
          user_id?: string | null
          weather?: string
          with_people?: string
        }
        Update: {
          audience?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          fill?: string
          group_id?: string | null
          happened_on?: string
          id?: string
          place?: string
          server_updated_at?: string
          square_state_id?: string
          title?: string
          updated_at?: string
          user_id?: string | null
          weather?: string
          with_people?: string
        }
        Relationships: [
          {
            foreignKeyName: "moments_square_state_id_fkey"
            columns: ["square_state_id"]
            isOneToOne: false
            referencedRelation: "square_states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          audience: string
          bytes: number
          created_at: string
          deleted_at: string | null
          group_id: string | null
          height: number
          id: string
          is_cover: boolean
          moment_id: string
          position: number
          server_updated_at: string
          storage_path: string | null
          updated_at: string
          user_id: string | null
          width: number
        }
        Insert: {
          audience?: string
          bytes?: number
          created_at: string
          deleted_at?: string | null
          group_id?: string | null
          height?: number
          id: string
          is_cover?: boolean
          moment_id: string
          position: number
          server_updated_at?: string
          storage_path?: string | null
          updated_at: string
          user_id?: string | null
          width?: number
        }
        Update: {
          audience?: string
          bytes?: number
          created_at?: string
          deleted_at?: string | null
          group_id?: string | null
          height?: number
          id?: string
          is_cover?: boolean
          moment_id?: string
          position?: number
          server_updated_at?: string
          storage_path?: string | null
          updated_at?: string
          user_id?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "photos_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          grid_id: string | null
          id: string
          moment_id: string | null
          note: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          target_kind: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          grid_id?: string | null
          id?: string
          moment_id?: string | null
          note?: string
          reason: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_kind?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          grid_id?: string | null
          id?: string
          moment_id?: string | null
          note?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          target_kind?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_grid_id_fkey"
            columns: ["grid_id"]
            isOneToOne: false
            referencedRelation: "grids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      square_states: {
        Row: {
          deleted_at: string | null
          done_at: string | null
          group_id: string | null
          id: string
          idx: number
          server_updated_at: string
          state: string
          updated_at: string
          user_grid_id: string
          user_id: string | null
          via_freebie: boolean
        }
        Insert: {
          deleted_at?: string | null
          done_at?: string | null
          group_id?: string | null
          id: string
          idx: number
          server_updated_at?: string
          state: string
          updated_at: string
          user_grid_id: string
          user_id?: string | null
          via_freebie?: boolean
        }
        Update: {
          deleted_at?: string | null
          done_at?: string | null
          group_id?: string | null
          id?: string
          idx?: number
          server_updated_at?: string
          state?: string
          updated_at?: string
          user_grid_id?: string
          user_id?: string | null
          via_freebie?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "square_states_user_grid_id_fkey"
            columns: ["user_grid_id"]
            isOneToOne: false
            referencedRelation: "user_grids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "square_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_grids: {
        Row: {
          audience: string
          completed_at: string | null
          deleted_at: string | null
          freebies_left: number
          grid_id: string
          group_id: string | null
          id: string
          server_updated_at: string
          show_moments: boolean
          started_at: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          audience?: string
          completed_at?: string | null
          deleted_at?: string | null
          freebies_left: number
          grid_id: string
          group_id?: string | null
          id: string
          server_updated_at?: string
          show_moments?: boolean
          started_at: string
          updated_at: string
          user_id?: string | null
        }
        Update: {
          audience?: string
          completed_at?: string | null
          deleted_at?: string | null
          freebies_left?: number
          grid_id?: string
          group_id?: string | null
          id?: string
          server_updated_at?: string
          show_moments?: boolean
          started_at?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_grids_grid_id_fkey"
            columns: ["grid_id"]
            isOneToOne: false
            referencedRelation: "grids"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_grids_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_path: string | null
          bio: string
          created_at: string
          id: string
          interests: string[]
          is_admin: boolean
          moments_public: boolean
          onboarded_at: string | null
          sharing_suspended: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_path?: string | null
          bio?: string
          created_at?: string
          id: string
          interests?: string[]
          is_admin?: boolean
          moments_public?: boolean
          onboarded_at?: string | null
          sharing_suspended?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_path?: string | null
          bio?: string
          created_at?: string
          id?: string
          interests?: string[]
          is_admin?: boolean
          moments_public?: boolean
          onboarded_at?: string | null
          sharing_suspended?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_friend_code: { Args: { code: string }; Returns: string }
      admin_clear_avatar: { Args: { target: string }; Returns: string }
      admin_moment: { Args: { moment: string }; Returns: Json }
      admin_resolve_report: {
        Args: { action: string; report: string }
        Returns: undefined
      }
      admin_set_grid_hidden: {
        Args: { grid: string; hidden: boolean }
        Returns: undefined
      }
      admin_set_moment_hidden: {
        Args: { hidden: boolean; moment: string }
        Returns: undefined
      }
      admin_set_sharing_suspended: {
        Args: { suspended: boolean; target: string }
        Returns: undefined
      }
      are_friends: { Args: { a: string; b: string }; Returns: boolean }
      avatars: {
        Args: { ids: string[] }
        Returns: {
          avatar_path: string
          id: string
        }[]
      }
      atlas_grids: {
        Args: never
        Returns: {
          author_id: string
          color: string
          cols: number
          description: string
          id: string
          is_official: boolean
          made_by: string
          rows: number
          shared_at: string
          size: string
          starters: string[]
          theme: string
          title: string
          updated_at: string
        }[]
      }
      block_user: { Args: { other: string }; Returns: undefined }
      can_manage_group_folder: { Args: { path: string }; Returns: boolean }
      can_read_avatar: { Args: { path: string }; Returns: boolean }
      can_read_photo: { Args: { path: string }; Returns: boolean }
      can_see_avatar: { Args: { owner: string }; Returns: boolean }
      can_view: {
        Args: { audience: string; owner: string; viewer: string }
        Returns: boolean
      }
      can_view_moment: { Args: { moment: string }; Returns: boolean }
      cancel_group_invite: {
        Args: { friend: string; grp: string }
        Returns: undefined
      }
      cancel_request: { Args: { other: string }; Returns: undefined }
      claim_username: { Args: { name: string }; Returns: string }
      friend_moments: {
        Args: { lim?: number }
        Returns: {
          cover_path: string | null
          created_at: string
          fill: string
          grid_color: string
          grid_title: string
          happened_on: string
          moment_id: string
          title: string
          user_id: string
          username: string | null
        }[]
      }
      invite_to_group: {
        Args: { friend: string; grp: string }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_blocked: { Args: { a: string; b: string }; Returns: boolean }
      is_group_member: { Args: { g: string }; Returns: boolean }
      leave_group: { Args: { grp: string }; Returns: string }
      make_friends: { Args: { a: string; b: string }; Returns: undefined }
      make_group: {
        Args: { share_existing?: boolean; user_grid: string }
        Returns: string
      }
      moment_audience: { Args: { moment: string }; Returns: string }
      my_blocks: {
        Args: never
        Returns: {
          id: string
          username: string
        }[]
      }
      my_friend_code: { Args: never; Returns: string }
      my_friend_requests: {
        Args: never
        Returns: {
          created_at: string
          id: string
          username: string
        }[]
      }
      my_friends: {
        Args: never
        Returns: {
          id: string
          since: string
          username: string
        }[]
      }
      my_group_invites: {
        Args: never
        Returns: {
          color: string
          cols: number
          created_at: string
          from_username: string
          group_id: string
          rows: number
          title: string
        }[]
      }
      my_groups: {
        Args: never
        Returns: {
          group_id: string
          people: Json
        }[]
      }
      narrower: { Args: { a: string; b: string }; Returns: string }
      preview_friend_code: {
        Args: { code: string }
        Returns: {
          id: string
          relation: string
          username: string
        }[]
      }
      profile: { Args: { target: string }; Returns: Json }
      profile_grid: { Args: { user_grid: string }; Returns: Json }
      regrouping: { Args: never; Returns: boolean }
      relation_to: { Args: { other: string }; Returns: string }
      remove_friend: { Args: { other: string }; Returns: undefined }
      request_friend: { Args: { target: string }; Returns: string }
      require_admin: { Args: never; Returns: undefined }
      respond_group_invite: {
        Args: { accept: boolean; grp: string }
        Returns: undefined
      }
      respond_request: {
        Args: { accept: boolean; other: string }
        Returns: undefined
      }
      save_grid: { Args: { g: Json; squares: Json }; Returns: string }
      set_avatar: { Args: { path: string }; Returns: string }
      search_usernames: {
        Args: { prefix: string }
        Returns: {
          id: string
          relation: string
          username: string
        }[]
      }
      starting_squares: { Args: { size: string }; Returns: number[] }
      unblock_user: { Args: { other: string }; Returns: undefined }
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
