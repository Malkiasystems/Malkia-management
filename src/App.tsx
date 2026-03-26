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
import Settings from './pages/Settings'
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

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  const renderPage = () => {
    switch (page) {
      case 'dashboard':         return <Dashboard onNav={setPage} />
      case 'vouchers':          return <VouchersHub onNav={setPage} />
      case 'chart-of-accounts': return <ChartOfAccounts />
      case 'inventory':         return <Inventory />
      case 'reports':           return <ReportsHub onNav={setPage} />
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
      case 'banks':            return <Banks />
      case 'settings':          return <Settings onNav={setPage} />
      case 'cash-payment':      return <CashPayment onNav={setPage} />
      case 'bank-payment':      return <CashPayment onNav={setPage} />
      case 'cash-receipt':      return <CashReceipt onNav={setPage} />
      case 'bank-receipt':      return <CashReceipt onNav={setPage} />
      case 'bank-transfer':     return <BankTransfer onNav={setPage} />
      case 'petty-cash':        return <PettyCash onNav={setPage} />
      case 'contra':            return <ContraEntry onNav={setPage} />
      case 'cash-sale':         return <CashSale />
      case 'sales':             return <CashSale />
      case 'sales-invoice':     return <SalesInvoice onNav={setPage} />
      case 'sales-return':      return <SalesReturn onNav={setPage} />
      case 'debit-note':        return <DebitNote onNav={setPage} />
      case 'credit-note':       return <CreditNote onNav={setPage} />
      case 'purchase-order':    return <PurchaseOrder onNav={setPage} />
      case 'grn':               return <GRN onNav={setPage} />
      case 'purchase-invoice':  return <PurchaseInvoice onNav={setPage} />
      case 'purchase-return':   return <PurchaseReturn onNav={setPage} />
      case 'opening-stock':     return <OpeningStock onNav={setPage} />
      case 'stock-adjustment':  return <StockAdjustment onNav={setPage} />
      case 'stock-transfer':    return <StockTransfer onNav={setPage} />
      case 'journal-entry':     return <JournalEntry onNav={setPage} />
      default:                  return <ComingSoon module={BREADCRUMBS[page] || page} />
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <Topbar breadcrumb={BREADCRUMBS[page] || 'Dashboard'} onNav={setPage} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar current={page} onNav={setPage} />
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
