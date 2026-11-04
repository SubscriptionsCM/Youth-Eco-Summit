# SMS phone layout — 8 October 2026

Updated the current live WordPress portal to 1.2.3. Material form styling positioned the phone input wrapper absolutely, collapsing its space and placing the country control outside the input. Its original dial code styling also set opacity to zero.

Scoped portal CSS restores the wrapper to normal flow, keeps the flag and dial code inside the input, reserves space for the number, removes floating-label indentation, and spaces the SMS action below the field. Mobile buttons fill the available width and wrap their label. Existing miniOrange handlers, verification settings, drafts and field names are unchanged.

Verified the contact step at desktop and 390px mobile width, including visible +91, alignment and validation messages. No SMS was sent and no school registration submitted. The synthetic layout-test draft was privately backed up before removal.

Private production backups: `/home/u794443438/yes-deploy-backups/sms-layout-20261008/`.
