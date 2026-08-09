import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service | Fried Egg Events',
  description: 'Terms of Service for using Fried Egg Events.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-3xl mx-auto px-6 py-12 md:py-16">
        <Link
          href="/"
          className="text-gray-400 hover:text-white text-sm mb-8 inline-block"
        >
          ← Back
        </Link>

        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-gray-400 mb-10">
          Effective date: August 8, 2026
        </p>

        <div className="space-y-10 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Agreement</h2>
            <p>
              By accessing or using Fried Egg Events (the “Service”), including
              creating an account, creating an event, registering for an event,
              or making a payment, you agree to these Terms of Service
              (“Terms”) and our{' '}
              <Link href="/fees" className="text-emerald-400 hover:text-emerald-300">
                Fee Policy
              </Link>
              . If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. The Service</h2>
            <p>
              Fried Egg Events provides tools to organize, promote, register for,
              score, and manage golf events and related payments. We may update,
              change, or discontinue features at any time. We do not guarantee
              uninterrupted or error-free operation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Accounts</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You must provide accurate account information and keep it updated.</li>
              <li>You are responsible for activity under your account and for keeping login credentials secure.</li>
              <li>You must be at least 18 years old, or the age of majority in your jurisdiction, to create an organizer account or make payments.</li>
              <li>We may suspend or terminate accounts that violate these Terms or pose risk to the Service or other users.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Organizers and events</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                If you create or manage an event, you are the organizer and are
                solely responsible for the event, including rules, safety,
                staffing, course arrangements, refunds (except as required by
                law or payment networks), communications with players, and
                compliance with applicable laws and course policies.
              </li>
              <li>
                You must ensure participants receive and agree to any required
                waivers, releases, or local terms for your event.
              </li>
              <li>
                Fried Egg Events is a software platform only. We are not the
                host, sponsor, or operator of your event unless we expressly
                say so in writing.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Players and registration</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Event details, prices, formats, and policies are set by the
                organizer. Review them before registering or paying.
              </li>
              <li>
                Registration is subject to availability, organizer approval,
                and payment authorization where required.
              </li>
              <li>
                Questions about pairings, start times, weather delays, or
                on-course issues should be directed to the organizer.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Payments, fees, and payouts</h2>
            <p>
              Payments are processed by third-party providers (including Stripe).
              Platform fees, processing fees, and organizer payouts are described
              in our{' '}
              <Link href="/fees" className="text-emerald-400 hover:text-emerald-300">
                Fee Policy
              </Link>
              , which is part of these Terms.
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>You authorize charges for the amounts shown at checkout.</li>
              <li>
                Organizers may be required to complete payment-provider onboarding
                (such as Stripe Connect) to receive funds.
              </li>
              <li>
                Refunds, chargebacks, and disputes are handled as described in
                the Fee Policy and by the payment provider’s rules.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-2">
              <li>Use the Service for unlawful, fraudulent, or harmful purposes</li>
              <li>Attempt to gain unauthorized access to systems, data, or accounts</li>
              <li>Scrape, abuse, or overload the Service</li>
              <li>Upload malware or interfere with other users</li>
              <li>Misrepresent your identity, organization, or authority to run an event</li>
              <li>Infringe intellectual property or privacy rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Content</h2>
            <p>
              You retain ownership of content you submit (such as event names,
              descriptions, and images). You grant Fried Egg Events a
              non-exclusive license to host, display, and use that content as
              needed to operate and promote the Service. You represent that you
              have the rights to submit that content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Privacy</h2>
            <p>
              We process personal information as needed to provide the Service
              (for example account data, registration details, and payment
              metadata). Payment card data is handled by our payment processor,
              not stored by Fried Egg Events as full card numbers. Contact us for
              privacy questions or data requests where applicable law allows.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              10. Disclaimers
            </h2>
            <p>
              THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT
              WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
              NON-INFRINGEMENT. Golf and related activities involve inherent
              risk. Fried Egg Events is not responsible for injuries, property
              damage, course conditions, weather, or event outcomes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">
              11. Limitation of liability
            </h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, FRIED EGG EVENTS AND ITS
              OWNERS, EMPLOYEES, AND PARTNERS WILL NOT BE LIABLE FOR INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY
              LOSS OF PROFITS, DATA, OR GOODWILL. OUR TOTAL LIABILITY FOR ANY
              CLAIM RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF (A)
              THE AMOUNTS YOU PAID TO FRIED EGG EVENTS FOR THE PLATFORM FEES IN
              THE THREE MONTHS BEFORE THE CLAIM OR (B) $100 USD.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">12. Indemnification</h2>
            <p>
              You agree to defend and indemnify Fried Egg Events from claims,
              damages, and expenses arising out of your events, your content,
              your use of the Service, or your violation of these Terms or
              applicable law—especially if you are an organizer.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">13. Changes</h2>
            <p>
              We may update these Terms by posting a revised version on this
              page. Continued use after changes become effective constitutes
              acceptance. Material changes may also be communicated by email or
              in-product notice when appropriate.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">14. Governing law</h2>
            <p>
              These Terms are governed by the laws of the State of Georgia, USA,
              without regard to conflict-of-law rules, unless mandatory local law
              provides otherwise. Courts located in Georgia will have exclusive
              jurisdiction, except where prohibited.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">15. Contact</h2>
            <p>
              Questions about these Terms:{' '}
              <a
                href="mailto:support@friedeggevents.app"
                className="text-emerald-400 hover:text-emerald-300"
              >
                support@friedeggevents.app
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}