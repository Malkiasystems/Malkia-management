import { useState } from 'react'
import { BREADCRUMBS } from './lib/data'
import type { Page } from './lib/types'

import Topbar from './components/Topbar'
import Sidebar from './components/Sidebar'

import Dashboard from './pages/Dashboard'
import ComingSoon from './pages/ComingSoon'
import ChartOfAccounts from './pages/ChartOfAccounts'
import Inventory from './pages/Inventory'
import ReportsHub from './pages/ReportsHub'
import PnL from './pages/PnL'
import SalesRegister from './pages/SalesRegister'
import SalesDayBook from './pages/SalesDayBook'
import TrialBalance from './pages/TrialBalance'
import BalanceSheet from './pages/BalanceSheet'
import ARAgingReport from './pages/ARAgingReport'
import APAgingReport from './pages/APAgingReport'
import VATReport from './pages/VATReport'
import StockValuationReport from './pages/StockValuationReport'
import PurchaseRegister from './pages/PurchaseRegister'
import PaymentRegister from './pages/PaymentRegister'
import ReceiptTemplatePage from './pages/ReceiptTemplate'
import InvoiceTemplatePage from './pages/InvoiceTemplate'
import WhatsAppSettings from './pages/WhatsAppSettings'
import LocationSettings from './pages/LocationSettings'
import InventorySettings from './pages/InventorySettings'
import StockTransferRegister from './pages/StockTransferRegister'
import Customers from './pages/Customers'
import Settings from './pages/Settings'
import DataImport from './pages/DataImport'
import Banks from './pages/Banks'

import VouchersHub from './pages/vouchers/VouchersHub'
import CashPayment from './pages/vouchers/CashPayment'
import CashReceipt from './pages/vouchers/CashReceipt'
import BankTransfer from './pages/vouchers/BankTransfer'
import ContraEntry from './pages/vouchers/ContraEntry'
import PettyCash from './pages/vouchers/PettyCash'
import CashSale from './pages/vouchers/CashSale'
import SalesInvoice from './pages/vouchers/SalesInvoice'
import SalesReturn from './pages/vouchers/SalesReturn'
import DebitNote from './pages/vouchers/DebitNote'
import CreditNote from './pages/vouchers/CreditNote'
import PurchaseOrder from './pages/vouchers/PurchaseOrder'
import GRN from './pages/vouchers/GRN'
import PurchaseInvoice from './pages/vouchers/PurchaseInvoice'
import PurchaseReturn from './pages/vouchers/PurchaseReturn'
import OpeningStock from './pages/vouchers/OpeningStock'
import StockAdjustment from './pages/vouchers/StockAdjustment'
import StockTransfer from './pages/vouchers/StockTransfer'
import JournalEntry from './pages/vouchers/JournalEntry'

// CRM Module Pages
import CRMHub from './pages/crm/CRMHub'
import CRMInbox from './pages/crm/CRMInbox'
import CRMAutomations from './pages/crm/CRMAutomations'
import CRMPreorders from './pages/crm/CRMPreorders'
import CRMReferrals from './pages/crm/CRMReferrals'
import CRMLoyalty from './pages/crm/CRMLoyalty'
import CRMFeedback from './pages/crm/CRMFeedback'
import CRMUpsell from './pages/crm/CRMUpsell'

// Extended breadcrumbs for CRM
const CRM_BREADCRUMBS: Record<string, string> = {
  'crm-hub': 'CRM Hub',
  'crm-inbox': 'CRM / Inbox',
  'crm-automations': 'CRM / Automations',
  'crm-preorders': 'CRM / Pre-Orders',
  'crm-referrals': 'CRM / Referrals',
  'crm-loyalty': 'CRM / Crown Rewards',
  'crm-feedback': 'CRM / Feedback',
  'crm-upsell': 'CRM / Upsell Engine',
}

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [history, setHistory] = useState<Page[]>([])

  const navigate = (p: Page) => {
    setHistory(h => [...h.slice(-19), page]) // keep last 20
    setPage(p)
  }

  const goBack = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory(h => h.slice(0, -1))
    setPage(prev)
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard':         return <Dashboard onNav={navigate} />
      case 'vouchers':          return <VouchersHub onNav={navigate} />
      case 'chart-of-accounts': return <ChartOfAccounts />
      case 'inventory':         return <Inventory />
      case 'reports':           return <ReportsHub onNav={navigate} />
      case 'pnl':               return <PnL />
      case 'sales-register':    return <SalesRegister />
      case 'sales-day-book':    return <SalesDayBook />
      case 'trial-balance':    return <TrialBalance />
      case 'balance-sheet':    return <BalanceSheet />
      case 'ar-aging':         return <ARAgingReport />
      case 'ap-aging':         return <APAgingReport />
      case 'vat-report':       return <VATReport />
      case 'stock-valuation':  return <StockValuationReport />
      case 'purchase-register': return <PurchaseRegister />
      case 'payment-register': return <PaymentRegister />
      case 'receipt-template':  return <ReceiptTemplatePage />
      case 'invoice-template':  return <InvoiceTemplatePage />
      case 'whatsapp-settings':  return <WhatsAppSettings />
      case 'location-settings':  return <LocationSettings />
      case 'inventory-settings': return <InventorySettings onNav={navigate} />
      case 'pricelist-template':  return <div className="page"><div className="page-title">Price List</div><div className="page-sub">Coming soon</div></div>
      case 'banks':            return <Banks />
      case 'settings':          return <Settings onNav={navigate} />
      case 'cash-payment':      return <CashPayment onNav={navigate} />
      case 'bank-payment':      return <CashPayment onNav={navigate} />
      case 'cash-receipt':      return <CashReceipt onNav={navigate} />
      case 'bank-receipt':      return <CashReceipt onNav={navigate} />
      case 'bank-transfer':     return <BankTransfer onNav={navigate} />
      case 'petty-cash':        return <PettyCash onNav={navigate} />
      case 'contra':            return <ContraEntry onNav={navigate} />
      case 'cash-sale':         return <CashSale />
      case 'sales':             return <CashSale />
      case 'sales-invoice':     return <SalesInvoice onNav={navigate} />
      case 'sales-return':      return <SalesReturn onNav={navigate} />
      case 'debit-note':        return <DebitNote onNav={navigate} />
      case 'credit-note':       return <CreditNote onNav={navigate} />
      case 'purchase-order':    return <PurchaseOrder onNav={navigate} />
      case 'grn':               return <GRN onNav={navigate} />
      case 'purchase-invoice':  return <PurchaseInvoice onNav={navigate} />
      case 'purchase-return':   return <PurchaseReturn onNav={navigate} />
      case 'opening-stock':     return <OpeningStock onNav={navigate} />
      case 'stock-adjustment':  return <StockAdjustment onNav={navigate} />
      case 'stock-transfer':    return <StockTransfer onNav={navigate} />
      case 'stock-transfer-register': return <StockTransferRegister />
      case 'customers': return <Customers />
      case 'journal-entry':     return <JournalEntry onNav={navigate} />
      case 'data-import':       return <DataImport />
      
      // CRM Module Routes
      case 'crm':
      case 'crm-hub':           return <CRMHub onNav={navigate} />
      case 'crm-inbox':         return <CRMInbox onNav={navigate} />
      case 'crm-automations':   return <CRMAutomations onNav={navigate} />
      case 'crm-preorders':     return <CRMPreorders onNav={navigate} />
      case 'crm-referrals':     return <CRMReferrals onNav={navigate} />
      case 'crm-loyalty':       return <CRMLoyalty onNav={navigate} />
      case 'crm-feedback':      return <CRMFeedback onNav={navigate} />
      case 'crm-upsell':        return <CRMUpsell onNav={navigate} />
      case 'crm-customers':     return <Customers />
      
      default:                  return <ComingSoon module={BREADCRUMBS[page] || CRM_BREADCRUMBS[page] || page} />
    }
  }

  const breadcrumb = BREADCRUMBS[page] || CRM_BREADCRUMBS[page] || 'Dashboard'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Topbar breadcrumb={breadcrumb} onNav={navigate} onBack={goBack} canGoBack={history.length > 0} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar current={page} onNav={navigate} />
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
