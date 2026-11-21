// ---------------------------------------------------------------------------
// UpiIntentModule — open a UPI app "for a result" and hand back its reply.
//
// UPI apps (GPay, PhonePe, Paytm, BHIM…) that support the NPCI intent spec
// return an Intent with a "response" extra such as
//   txnId=…&responseCode=00&Status=SUCCESS&txnRef=…
// Parsing happens in JS (services/upiResult.ts) so it can be unit-tested.
// ---------------------------------------------------------------------------
package expo.modules.upiintent

import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UpiIntentModule : Module() {
  private val requestCode = 47211
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("UpiIntent")

    AsyncFunction("pay") { uri: String, title: String, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("E_NO_ACTIVITY", "Billy isn't in the foreground", null)
        return@AsyncFunction
      }
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
      if (intent.resolveActivity(activity.packageManager) == null) {
        promise.resolve(mapOf("launched" to false, "resultCode" to 0, "response" to ""))
        return@AsyncFunction
      }
      // A previous payment that never came back: finish it as "no reply".
      pending?.resolve(mapOf("launched" to true, "resultCode" to 0, "response" to ""))
      pending = promise
      activity.startActivityForResult(Intent.createChooser(intent, title), requestCode)
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != requestCode) return@OnActivityResult
      val promise = pending ?: return@OnActivityResult
      pending = null
      val data = payload.data
      val response = data?.getStringExtra("response")
        ?: data?.getStringExtra("Status")?.let { "Status=$it" }
        ?: ""
      promise.resolve(mapOf("launched" to true, "resultCode" to payload.resultCode, "response" to response))
    }
  }
}
