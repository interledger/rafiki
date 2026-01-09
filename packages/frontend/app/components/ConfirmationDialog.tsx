import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { ExclamationTriangle, XIcon } from './icons'
import {
  Button,
  TextField,
  Dialog,
  Flex,
  Text,
  IconButton
} from '@radix-ui/themes'

export type ConfirmationDialogRef = {
  display: () => void
}

type ConfirmationDialogProps = {
  title: string
  keyword: string
  message?: string
  confirmButtonText: string
  onConfirm: () => void
  onCancel?: () => void
}

export const ConfirmationDialog = forwardRef<
  ConfirmationDialogRef,
  ConfirmationDialogProps
>(
  (
    { onConfirm, onCancel, title, message, keyword, confirmButtonText },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false)
    const [confirmationPrompt, setConfirmationPrompt] = useState('')

    const inputRef = useRef<HTMLInputElement>(null)

    const display = (): void => {
      setIsOpen(true)
    }

    const isCorrectPrompt = (): boolean => confirmationPrompt === keyword

    const confirmHandler = (): void => {
      if (isCorrectPrompt()) {
        setIsOpen(false)
        setConfirmationPrompt('')
        if (onConfirm) {
          onConfirm()
        }
      }
    }

    const cancelHandler = (): void => {
      setIsOpen(false)
      setConfirmationPrompt('')
      if (onCancel) {
        onCancel()
      }
    }

    useImperativeHandle(ref, () => ({ display }))

    return (
      <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
        <Dialog.Content style={{ maxWidth: 500 }}>
          <Dialog.Title>
            <Flex align='center' gap='3'>
              <Flex
                align='center'
                justify='center'
                className='h-12 w-12 rounded-full bg-red-100'
              >
                <ExclamationTriangle
                  className='text-red-500 h-6 w-6'
                  aria-hidden='true'
                />
              </Flex>
              <Text size='5' weight='bold'>
                {title}
              </Text>
            </Flex>
          </Dialog.Title>

          <Dialog.Description size='2' mt='4' mb='4'>
            {message
              ? message
              : 'Please note that this action is not reversible.'}
          </Dialog.Description>

          <Flex direction='column' gap='3'>
            <Text size='2' weight='medium'>
              To confirm, type &quot;
              <Text weight='bold' as='span'>
                {keyword}
              </Text>
              &quot; below:
            </Text>
            <TextField.Root
              value={confirmationPrompt}
              ref={inputRef}
              onChange={(e) => setConfirmationPrompt(e.currentTarget.value)}
              size='3'
              placeholder={keyword}
            />
          </Flex>

          <Flex gap='3' mt='5' justify='end'>
            <Dialog.Close>
              <Button variant='soft' color='gray' onClick={cancelHandler}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              color='red'
              onClick={confirmHandler}
              disabled={!isCorrectPrompt()}
            >
              {confirmButtonText}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    )
  }
)
ConfirmationDialog.displayName = 'ConfirmationDialog'
