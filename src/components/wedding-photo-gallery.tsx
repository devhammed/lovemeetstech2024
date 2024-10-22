import { useState, useEffect, useRef, useCallback, FormEvent, ChangeEvent } from 'react'
import { User } from 'firebase/auth'
import { sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth'
import { ref, listAll, getDownloadURL, uploadBytes } from 'firebase/storage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Toaster, toast } from 'react-hot-toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Heart, Upload } from 'lucide-react'
import { auth, storage } from '@/lib/firebase'

const photosPerPage = parseInt(import.meta.env.VITE_PHOTOS_PER_PAGE, 10);

export function WeddingPhotoGalleryComponent() {
  const [email, setEmail] = useState<string>('')
  const [user, setUser] = useState<User|null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [sendingSignInLink, setSendingSignInLink] = useState<boolean>(false)
  const [hasMore, setHasMore] = useState<boolean>(true)
  const [lastVisible, setLastVisible] = useState<string|null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalEmail, setModalEmail] = useState<string>('')
  const observer = useRef<IntersectionObserver>()
  const lastPhotoElementRef = useCallback((node: HTMLDivElement) => {
    if (loading) {
      return
    }

    if (observer.current) {
      observer.current.disconnect()
    }

    observer.current = new IntersectionObserver(async entries => {
      if (entries[0].isIntersecting && hasMore) {
        fetchMorePhotos().catch(error => {
          console.error('Error fetching photos', error)
          toast.error('Error fetching photos. Please try again.')
        });
      }
    })

    if (node) {
      observer.current.observe(node)
    }
  }, [loading, hasMore]);

  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      const email = window.localStorage.getItem('emailForSignIn')

      if (!email) {
        setIsModalOpen(true)
      } else {
         completeSignIn(email).catch(error => {
            console.error('Error completing sign-in', error)
            toast.error('Error completing sign-in. Please try again.')
         });
      }
    }
  }, []);

  useEffect(() => {
    const authStateSubscription = auth.onAuthStateChanged((user) => {
        setUser(user)
    });

    if (user) {
      fetchPhotos().catch(error => {
        console.error('Error fetching photos', error)
        toast.error('Error fetching photos. Please try again.')
      });
    }

    return authStateSubscription;
  }, [user]);

  const completeSignIn = async (email: string) => {
    try {
      const result = await signInWithEmailLink(auth, email, window.location.href)
      const user = result.user;
      window.localStorage.removeItem('emailForSignIn');
      window.history.replaceState({}, document.title, window.location.pathname);
      setUser(user);
      toast.success('Successfully signed in!')
    } catch (error) {
      console.error('Error signing in with email link', error)
      toast.error('Error signing in. Please try again.')
    }
  };

  const sendSignInLink = async (e: FormEvent) => {
    e.preventDefault()

    setSendingSignInLink(true)

    try {
      await sendSignInLinkToEmail(auth, email, {
        url: window.location.href,
        handleCodeInApp: true,
      })

      window.localStorage.setItem('emailForSignIn', email)

      toast.success('Sign-in link sent to your email!')
    } catch (error) {
      console.error('Error sending sign-in link', error)
      toast.error('Error sending sign-in link. Please try again.')
    }

    setSendingSignInLink(false)
  }

  const fetchPhotos = async () => {
    setLoading(true)

    try {
      const listRef = ref(storage, 'photos')
      const res = await listAll(listRef)
      const sortedItems = res.items.sort((a, b) => b.name.localeCompare(a.name))
      const batch = sortedItems.slice(0, photosPerPage)
      const urls = await Promise.all(batch.map(itemRef => getDownloadURL(itemRef)))
      const lastItem = batch[batch.length - 1];
      setPhotos(urls)
      setLastVisible(lastItem?.name)
      setHasMore(sortedItems.length > photosPerPage)
    } catch (error) {
      console.error('Error fetching photos', error)
      toast.error('Error fetching photos. Please try again.')
    }

    setLoading(false)
  }

  const fetchMorePhotos = async () => {
    if (loading || !hasMore) {
      return
    }

    setLoading(true)

    try {
      const listRef = ref(storage, 'photos')
      const res = await listAll(listRef)
      const sortedItems = res.items.sort((a, b) => b.name.localeCompare(a.name))
      const startIndex = sortedItems.findIndex(item => item.name === lastVisible) + 1
      const batch = sortedItems.slice(startIndex, startIndex + photosPerPage)
      const urls = await Promise.all(batch.map(itemRef => getDownloadURL(itemRef)))
      const lastItem = batch[batch.length - 1];

      setLastVisible(lastItem?.name)
      setPhotos(prevPhotos => [...prevPhotos, ...urls])
      setHasMore(startIndex + photosPerPage < sortedItems.length)
    } catch (error) {
      console.error('Error fetching more photos', error)
      toast.error('Error fetching more photos. Please try again.')
    }

    setLoading(false)
  }

  const uploadImage = async (file: File) => {
    try {
      const storageRef = ref(storage, `photos/${Date.now()}_${file.name}`)

      await toast.promise(uploadBytes(storageRef, file), {
        loading: 'Uploading image...',
        success: 'Image uploaded successfully!',
        error: 'Error uploading image. Please try again.'
      });

      await fetchPhotos();
    } catch (error) {
      console.error('Error uploading image', error);
      toast.error('Error uploading image. Please try again.')
    }
  }

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files![0];

    if (file) {
      await uploadImage(file);
    }
  }

  const handleModalSubmit = async  (e: FormEvent) => {
    e.preventDefault()

    try {
      await completeSignIn(modalEmail)
    } catch (error) {
        console.error('Error completing sign-in', error)
        toast.error('Error completing sign-in. Please try again.')
    }

    setIsModalOpen(false)
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-white flex items-center justify-center">
        <Card className="w-full max-w-md mx-auto backdrop-blur-sm bg-white/30 border border-blue-200 shadow-lg">
          <CardContent className="p-6">
            <h2 className="text-3xl font-bold mb-6 text-center text-blue-800">Wedding Photo Gallery</h2>
            <form onSubmit={sendSignInLink} className="space-y-4">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-white/50 border-blue-300 focus:border-blue-500 focus:ring-blue-500"
              />
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={sendingSignInLink}>
                {sendingSignInLink ? 'Sending...' : ' Send Sign-In Link'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="bg-white/80 backdrop-blur-md border border-blue-200">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-blue-800">Confirm Your Email</DialogTitle>
              <DialogDescription className="text-blue-600">
                Please enter your email to complete the sign-in process.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleModalSubmit}>
              <Input
                type="email"
                placeholder="Enter your email"
                value={modalEmail}
                onChange={(e) => setModalEmail(e.target.value)}
                required
                className="bg-white/50 border-blue-300 focus:border-blue-500 focus:ring-blue-500"
              />
              <DialogFooter className="mt-4">
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white">Confirm</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Toaster position="bottom-center"/>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-white p-4">
      <div className="container mx-auto">
        <h1 className="text-4xl font-bold mb-6 text-center text-blue-800 font-serif">
          #LoveMeetsTech2024
        </h1>

        <p className="text-center text-blue-600 mb-6">
            Share your royal moments with us! 📸
        </p>

        <div className="mb-6 flex justify-center space-x-4">
          <Button
            onClick={() => document.getElementById('fileInput')!.click()}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center"
          >
            <Upload className="mr-2 h-4 w-4" /> Upload Image
          </Button>

          <input
            id="fileInput"
            type="file"
            capture="user"
            accept="image/*"
            className="sr-only"
            onChange={handleFileUpload}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {photos.map((url, index) => (
            <div
              key={url}
              className="relative group overflow-hidden rounded-lg shadow-lg transition-transform duration-300 ease-in-out hover:scale-105"
              ref={index === photos.length - 1 ? lastPhotoElementRef : null}
            >
              <img
                src={url}
                alt={`Wedding Photo ${index + 1}`}
                className="w-full h-64 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-blue-600/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
                <Heart className="text-white h-8 w-8" />
              </div>
            </div>
          ))}
        </div>

        {loading && (
          <p className="text-center mt-4 text-blue-600">Loading more royal moments...</p>
        )}
        {!hasMore && (
          <p className="text-center mt-4 text-blue-600">You've seen all the regal love 👑❤️</p>
        )}
      </div>

      <Toaster position="bottom-center"/>
    </div>
  )
}
