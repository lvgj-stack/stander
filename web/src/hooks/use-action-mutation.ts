import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query'
import { toast } from 'sonner'

/**
 * A mutation that reports itself.
 *
 * Every write in this console does the same three things on the way out:
 * toast the outcome, refresh the list it changed, and surface the backend's
 * message verbatim on failure — the messages are already written in Chinese
 * for end users, so rewording them here would only lose detail.
 */
interface ActionMutationOptions<TData, TVariables>
  extends Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'> {
  mutationFn: (variables: TVariables) => Promise<TData>
  /** Toast shown on success. Omit to stay silent. */
  successMessage?: string
  /** Query keys to invalidate once the write lands. */
  invalidate?: readonly unknown[][]
}

export function useActionMutation<TData, TVariables>({
  mutationFn,
  successMessage,
  invalidate,
  onSuccess,
  onError,
  ...rest
}: ActionMutationOptions<TData, TVariables>) {
  const queryClient = useQueryClient()

  return useMutation<TData, Error, TVariables>({
    mutationFn,
    ...rest,
    onSuccess: async (...args) => {
      if (successMessage) toast.success(successMessage)
      if (invalidate) {
        await Promise.all(
          invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        )
      }
      await onSuccess?.(...args)
    },
    onError: (...args) => {
      toast.error(args[0].message || '操作失败')
      onError?.(...args)
    },
  })
}
