import Link from 'next/link';
import BackButton from '../components/BackButton';

export const metadata = {
  title: 'Fee Policy | Fried Egg Events',
  description:
    'Platform fees, organizer payouts, and payment processing for Fried Egg Events.',
};

export default function FeePolicyPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <BackButton />

        <h1 className="text-4xl font-bold mb-2">Fee Policy</h1>
        <p className="text-gray-400 mb-10">
          Effective date: August 8, 2026 · Applies to organizers and participants
          using Fried Egg Events.
        </p>

        <div className="space-y-10 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Overview</h2>
            <p>
              Fried Egg Events provides software for creating, managing, and
              collecting payment for golf events. Fees fall into three
              categories:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-1">
              <li>
                <strong className="text-white">Platform fee</strong> — paid to
                Fried Egg Events
              </li>
              <li>
                <strong className="text-white">Event entry / ticket price</strong>{' '}
                — paid to the event organizer
              </li>
              <li>
                <strong className="text-white">Card processing fees</strong> —
                paid to Stripe
              </li>
            </ul>
            <p className="mt-3">
              Fried Egg Events does <strong className="text-white">not</strong>{' '}
              store bank account or routing numbers. Payouts and bank details are
              handled by Stripe.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              2. Platform fee
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Fried Egg Events charges a platform fee per paid player
                registration (and, where applicable, per paid add-on checkout as
                configured).
              </li>
              <li>
                Current standard platform fee:{' '}
                <strong className="text-white">$3.00 USD per player</strong>{' '}
                (or the amount shown at checkout / in platform settings).
              </li>
              <li>The platform fee is disclosed before payment.</li>
              <li>The platform fee is retained by Fried Egg Events.</li>
              <li>
                The platform fee is generally{' '}
                <strong className="text-white">non-refundable</strong>,
                including when an organizer cancels, postpones, or refunds an
                event, unless required by law or expressly agreed in writing.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              3. What organizers receive
            </h2>
            <p>
              Organizers set the event price (and optional add-on prices). For
              each successful paid registration, the organizer is entitled to the
              event price they configured, subject to card processing costs and
              any refunds, chargebacks, or adjustments.
            </p>
            <p className="mt-3">
              Fried Egg Events’ platform fee is taken{' '}
              <strong className="text-white">before</strong> funds are reflected
              as available to the organizer through Stripe.
            </p>
            <div className="mt-4 bg-gray-800 rounded-2xl p-5 text-sm">
              <p className="font-medium text-white mb-2">Example (illustration)</p>
              <p>
                Player pays $50 entry + $3 platform fee = $53 (before any
                separate processing line item).
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Organizer: $50</li>
                <li>Fried Egg Events: $3</li>
                <li>Stripe processing: per Stripe’s rates (see section 4)</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              4. Card processing fees
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Payments are processed by Stripe.</li>
              <li>
                Stripe’s standard US card rates typically include a percentage +
                fixed fee (for example, about 2.9% + $0.30 per successful card
                charge; actual rates are set by Stripe and may vary).
              </li>
              <li>
                Depending on event settings, processing costs may be passed
                through to the player at checkout or absorbed in the overall
                pricing model.
              </li>
              <li>
                Fried Egg Events does not control Stripe’s fee schedule.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              5. Payouts to organizers
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Organizers who wish to receive registration funds must complete
                Stripe Connect onboarding (identity and bank verification).
              </li>
              <li>
                Payout timing follows Stripe’s payout schedule (often several
                business days after funds become available).
              </li>
              <li>
                Fried Egg Events does not hold organizer bank credentials and
                cannot deposit funds outside Stripe’s process.
              </li>
              <li>
                If an organizer has not completed Stripe Connect, paid
                registrations may still be collected by the platform in limited
                cases; settlement to the organizer may be delayed until Connect
                is complete.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              6. Refunds, cancellations, and chargebacks
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Refund policy for an event is set by the organizer, except where
                Fried Egg Events must act for legal, fraud, or payment-network
                reasons.
              </li>
              <li>
                If a refund is issued, card processing fees charged by Stripe may
                be non-recoverable. The Fried Egg Events platform fee is
                non-refundable unless required by law or agreed in writing.
              </li>
              <li>
                Chargebacks / disputes: if a player disputes a charge, Stripe may
                reverse funds. The organizer is responsible for the event-related
                amount and related fees where applicable.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Taxes</h2>
            <p>
              Organizers are responsible for determining and handling any sales
              tax or similar obligations related to their events. Fried Egg
              Events does not provide tax advice. Stripe may issue tax forms
              according to applicable rules and thresholds.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              8. Changes to fees
            </h2>
            <p>
              Fried Egg Events may update platform fees with notice via the
              website, app, or email. Fee changes apply to new registrations
              after the effective date unless otherwise stated. Completed
              payments are not retroactively repriced.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Contact</h2>
            <p>
              Questions about fees or payouts:{' '}
              <a
                href="mailto:support@friedeggevents.app"
                className="text-emerald-400 hover:text-emerald-300"
              >
                support@friedeggevents.app
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-800 text-sm text-gray-500">
          <p>
            Short version: Event price goes to the organizer. Fried Egg Events
            charges a platform fee per player. Card payments are processed by
            Stripe. Bank payouts are handled by Stripe. Fried Egg Events never
            stores your bank details.
          </p>
        </div>
      </div>
    </div>
  );
}