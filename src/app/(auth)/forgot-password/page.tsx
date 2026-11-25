import { isEmailEnabled } from '@/lib/email/send'
import { ForgotPasswordForm } from './forgot-password-form'

export const dynamic = 'force-dynamic'

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm emailEnabled={isEmailEnabled()} />
}
