import {
  CreditCard, Landmark, Target, Calendar, Shield,
  Wallet, PiggyBank, Building2, Home, Car, ShoppingCart,
  Briefcase, Banknote, TrendingUp, Star, Plane, Coffee,
  type LucideProps,
} from 'lucide-react'
import type { FC } from 'react'

const ICONS: Record<string, FC<LucideProps>> = {
  'credit-card':    CreditCard,
  'landmark':       Landmark,
  'target':         Target,
  'calendar':       Calendar,
  'shield':         Shield,
  'wallet':         Wallet,
  'piggy-bank':     PiggyBank,
  'building':       Building2,
  'home':           Home,
  'car':            Car,
  'shopping-cart':  ShoppingCart,
  'briefcase':      Briefcase,
  'banknote':       Banknote,
  'trending-up':    TrendingUp,
  'star':           Star,
  'plane':          Plane,
  'coffee':         Coffee,
}

export const ICON_KEYS = Object.keys(ICONS)

interface Props extends LucideProps {
  name: string
}

export default function AppIcon({ name, ...props }: Props) {
  const Icon = ICONS[name] ?? Wallet
  return <Icon {...props} />
}
