{-# LANGUAGE OverloadedStrings #-}

-- This is only common for server-side, not used by front-end
module Miso.Test.HttpClient
( HttpError(..)
, get
, get_
, post
, patch
, delete
) where

import Data.Text.Encoding (encodeUtf8)
import qualified Data.ByteString.Lazy as LBS
import qualified Data.ByteString as BS
import Network.HTTP.Simple hiding (httpLbs, Header)
import Network.HTTP.Types.Status (statusCode)
import Network.HTTP.Client
    ( newManager
    , managerSetMaxHeaderLength
    , httpLbs
    , responseTimeoutNone
    )
import Network.HTTP.Client.Conduit (defaultManagerSettings)
import Network.HTTP.Types.Header (HeaderName)
import Control.Exception.Safe (tryAny, SomeException)

import qualified Common.Server.JSONSettings as T

data HttpError
    = HttpException SomeException
    | StatusCodeError Int LBS.ByteString
    deriving (Show)

type Header = (HeaderName, [ BS.ByteString ])

get_ :: String -> [ Header ] -> IO (Either HttpError LBS.ByteString)
get_ url headers = do
    initReq <- parseRequest url
    let req = foldl (\r (k,v) -> setRequestHeader k v r) initReq headers
    putStrLn $ "calling " ++ url

    let man_settings = managerSetMaxHeaderLength (16384 * 4) defaultManagerSettings
    manager <- newManager man_settings
    handleHttp (httpLbs req manager)


get :: T.JSONSettings -> String -> IO (Either HttpError LBS.ByteString)
get settings path = get_ url [headers]
  where
    url = T.postgrest_url settings ++ path
    headers = bearer settings


request
  :: BS.ByteString
  -> T.JSONSettings
  -> String
  -> LBS.ByteString
  -> Bool
  -> IO (Either HttpError LBS.ByteString)
request method settings path payload return_repr = do
    let requestUrl = T.postgrest_url settings ++ path
    req <- parseRequest requestUrl
    let initReq = setRequestResponseTimeout responseTimeoutNone req
    let httpRequest = setRequestMethod method
            . setRequestHeader "Authorization" jwt_header
            . setRequestHeader "Content-Type" [ "application/json" ]
            . setRequestBodyLBS payload
            . prefer
            $ initReq

    putStrLn $ show method ++ "ing to " ++ requestUrl
    -- putStrLn $ "Payload: " ++ (LC8.unpack payload)
    handleHttp (httpLBS httpRequest)

    where
      jwt_header = snd $ bearer settings
      prefer =
        if return_repr
        then setRequestHeader "Prefer" [ "return=representation" ]
        else id


post
  :: T.JSONSettings
  -> String
  -> LBS.ByteString
  -> Bool
  -> IO (Either HttpError LBS.ByteString)
post = request "POST"


patch
  :: T.JSONSettings
  -> String
  -> LBS.ByteString
  -> Bool
  -> IO (Either HttpError LBS.ByteString)
patch = request "PATCH"


delete
  :: T.JSONSettings
  -> String
  -> Bool
  -> IO (Either HttpError LBS.ByteString)
delete settings path = request "DELETE" settings path LBS.empty


bearer :: T.JSONSettings -> Header
bearer settings = ("Authorization", [ jwt_header ])
    where
      jwt_header = encodeUtf8 $ "Bearer " <> T.jwt settings


handleHttp :: IO (Response LBS.ByteString) -> IO (Either HttpError LBS.ByteString)
handleHttp action = do
    result <- tryAny action
    case result of
        Right response ->
            let responseBody = getResponseBody response
            in if 200 <= (statusCode $ getResponseStatus response) && (statusCode $ getResponseStatus response) < 300
               then return $ Right responseBody
               else return $ Left (StatusCodeError (statusCode $ getResponseStatus response) responseBody)
        Left e -> do
            putStrLn "Some nasty http exception must have occurred"
            return $ Left $ HttpException e


