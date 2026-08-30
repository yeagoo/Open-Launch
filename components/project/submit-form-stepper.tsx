"use client"

import {
  RiCalendarLine,
  RiCheckLine,
  RiFileCheckLine,
  RiInformation2Line,
  RiListCheck,
} from "@remixicon/react"
import { useTranslations } from "next-intl"

import { submitStepProgress } from "@/lib/submit-step-progress"

interface SubmitFormStepperProps {
  currentStep: number
  onBackToStep: (step: number) => void
}

export function SubmitFormStepper({ currentStep, onBackToStep }: SubmitFormStepperProps) {
  const t = useTranslations("submitProject")
  const steps = [
    { step: 1, label: t("stepper.step1"), icon: RiListCheck },
    { step: 2, label: t("stepper.step2"), icon: RiInformation2Line },
    { step: 3, label: t("stepper.step3"), icon: RiCalendarLine },
    { step: 4, label: t("stepper.step4"), icon: RiFileCheckLine },
  ]

  return (
    <div className="mb-8 sm:mb-10">
      <div className="container mx-auto max-w-3xl">
        <div className="flex items-center justify-between pt-2 sm:px-4 sm:pt-0">
          {steps.map(({ step, label, icon: Icon }) => {
            const canJump = step < currentStep
            return (
              <div
                key={`step-${step}`}
                className="relative flex w-[120px] flex-col items-center sm:w-[140px]"
              >
                {step < 4 && (
                  <div className="absolute top-5 left-[calc(50%+1.5rem)] -z-10 hidden h-[2px] w-[calc(100%-1rem)] sm:block">
                    <div
                      className={`h-full ${
                        currentStep > step ? "bg-primary" : "bg-muted"
                      } transition-all duration-300`}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onBackToStep(step)}
                  disabled={!canJump}
                  aria-current={currentStep === step ? "step" : undefined}
                  aria-label={
                    canJump ? t("stepper.ariaJump", { label }) : t("stepper.ariaCurrent", { label })
                  }
                  className={`focus-visible:ring-primary/40 relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300 focus-visible:ring-4 focus-visible:outline-none sm:h-12 sm:w-12 ${
                    currentStep > step
                      ? "bg-primary ring-primary/10 hover:ring-primary/30 cursor-pointer text-white ring-4"
                      : currentStep === step
                        ? "bg-primary ring-primary/20 cursor-default text-white ring-4"
                        : "bg-muted/50 text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  {currentStep > step ? (
                    <RiCheckLine className="h-5 w-5 sm:h-6 sm:w-6" />
                  ) : (
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
                  )}

                  {currentStep === step && (
                    <span className="border-primary absolute inset-0 animate-pulse rounded-full border-2" />
                  )}
                </button>

                <div className="mt-3 w-full text-center sm:mt-4">
                  <span
                    className={`mb-0.5 block text-xs font-medium sm:text-sm ${
                      currentStep >= step ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-3 px-2 sm:mt-6 sm:px-4">
        <div className="bg-muted/50 h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
            style={{ width: `${submitStepProgress(currentStep) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
