export interface AuthUser {
  userId: string;
  roles?: string[];
  /** Claims Boutique (pour GET /me et affichage navbar) */
  username?: string;
  firstName?: string;
  email?: string;
  isAdmin?: boolean;
}
