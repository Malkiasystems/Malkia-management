import {
  Briefcase, Heart, Baby, Users, MessageCircleQuestion, Clock, LogOut, Siren, Phone, Activity, ShieldCheck, Megaphone, Bug, Hospital,
  Coffee, AlertTriangle, Stethoscope, Apple, Scissors, HeartPulse, Milk, Brain, Syringe, Wallet, BookOpen, ClipboardList, Droplets,
  Thermometer, Moon, Sun, Pill, Utensils, Banknote, Bed, Car, Bike, Home, Calendar, CheckCircle, Info, Star, Sparkles, Smile, Frown,
  Flame, Wind, Timer, ShoppingBag, Gift, Footprints, Lightbulb, MapPin, BadgeCheck, CreditCard, FileText, Eye, Ear, Hand, Bath, Shirt,
  Backpack, Soup, Leaf, Fish, Egg, Wheat, Droplet, Zap, HelpCircle, XCircle, AlertCircle, BellRing, Ambulance, Cross, TestTube, Weight, Ruler,
  type LucideIcon,
} from 'lucide-react'

/** Curated icon set for guides. Keys are stored in the DB; components render on web and in the PDF print view. */
export const GUIDE_ICONS: Record<string, LucideIcon> = {
  'clipboard-list': ClipboardList, 'book-open': BookOpen, briefcase: Briefcase, backpack: Backpack, 'shopping-bag': ShoppingBag,
  heart: Heart, 'heart-pulse': HeartPulse, baby: Baby, users: Users, smile: Smile, frown: Frown, hand: Hand,
  'id-card': CreditCard, 'credit-card': CreditCard, wallet: Wallet, banknote: Banknote, 'file-text': FileText,
  'message-circle-question': MessageCircleQuestion, 'help-circle': HelpCircle, info: Info, megaphone: Megaphone, 'bell-ring': BellRing, phone: Phone,
  clock: Clock, timer: Timer, calendar: Calendar, moon: Moon, sun: Sun,
  siren: Siren, 'alert-triangle': AlertTriangle, 'alert-circle': AlertCircle, 'x-circle': XCircle, 'shield-check': ShieldCheck, 'check-circle': CheckCircle, 'badge-check': BadgeCheck,
  hospital: Hospital, ambulance: Ambulance, cross: Cross, stethoscope: Stethoscope, syringe: Syringe, pill: Pill, thermometer: Thermometer, 'test-tube': TestTube, activity: Activity, bug: Bug, scissors: Scissors,
  brain: Brain, lightbulb: Lightbulb, sparkles: Sparkles, star: Star, zap: Zap, flame: Flame, wind: Wind,
  milk: Milk, droplets: Droplets, droplet: Droplet, bath: Bath, shirt: Shirt, bed: Bed, home: Home,
  apple: Apple, utensils: Utensils, soup: Soup, coffee: Coffee, leaf: Leaf, fish: Fish, egg: Egg, wheat: Wheat,
  car: Car, bike: Bike, 'map-pin': MapPin, footprints: Footprints, 'log-out': LogOut, gift: Gift, eye: Eye, ear: Ear, weight: Weight, ruler: Ruler,
}
export const ICON_NAMES = Object.keys(GUIDE_ICONS)
export function GuideIcon({ name, size = 18, className }: { name?: string | null; size?: number; className?: string }) {
  const C = (name && GUIDE_ICONS[name]) || ClipboardList
  return <C size={size} className={className} strokeWidth={2} />
}
